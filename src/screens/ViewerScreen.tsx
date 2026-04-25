import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import {readExif} from '../security/exif';
import {reconstructFormData} from '../security/encryption';
import {verifyViewerPassphrase, setViewerPassphrase} from '../security/keyManager';
import {ProcessedFormData, formatFieldValue} from '../types';
import {theme, radius, space} from '../theme';

/**
 * Viewer — unlocks with passphrase, opens an image,
 * decrypts embedded EXIF metadata and shows the original form data.
 */
export const ViewerScreen: React.FC = () => {
  const [pass, setPass] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [result, setResult] = useState<Record<string, any> | null>(null);
  const [raw, setRaw] = useState<ProcessedFormData | null>(null);

  const unlock = async () => {
    const ok = await verifyViewerPassphrase(pass);
    if (!ok) {
      Alert.alert(
        'Wrong passphrase',
        'If you haven\'t set one yet, tap "Set passphrase" below.',
      );
      return;
    }
    setUnlocked(true);
  };

  const setupPass = async () => {
    if (pass.length < 6) {
      Alert.alert('Passphrase must be at least 6 characters');
      return;
    }
    await setViewerPassphrase(pass);
    Alert.alert('Passphrase set');
    setUnlocked(true);
  };

  const pickImage = async () => {
    try {
      const res = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.images],
      });
      const exif = await readExif(res.uri.replace('file://', ''));
      if (!exif) {
        Alert.alert('No metadata', 'This image has no embedded data.');
        return;
      }
      setRaw(exif);
      const reconstructed = await reconstructFormData(exif);
      setResult(reconstructed);
    } catch (e: any) {
      if (!DocumentPicker.isCancel(e)) {
        Alert.alert('Failed to open file', e.message);
      }
    }
  };

  if (!unlocked) {
    return (
      <View style={styles.lockScreen}>
        <Text style={styles.lockTitle}>Locked</Text>
        <Text style={styles.lockSub}>
          Enter passphrase to decrypt metadata.
        </Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          placeholder="Passphrase"
          placeholderTextColor={theme.placeholder}
          value={pass}
          onChangeText={setPass}
        />
        <TouchableOpacity
          style={styles.btn}
          onPress={unlock}
          activeOpacity={0.7}>
          <Text style={styles.btnText}>Unlock</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnGhost]}
          onPress={setupPass}
          activeOpacity={0.7}>
          <Text style={styles.btnGhostText}>Set passphrase (first time)</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{padding: space.lg, paddingBottom: 48}}>
      <TouchableOpacity
        style={styles.btn}
        onPress={pickImage}
        activeOpacity={0.7}>
        <Text style={styles.btnText}>Open image</Text>
      </TouchableOpacity>

      {raw && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Metadata</Text>
          <Row k="Form ID" v={raw.formId} />
          <Row k="Version" v={String(raw.version)} />
          <Row k="Processed" v={raw.processedAt} />
        </View>
      )}

      {result && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Decrypted data</Text>
          {Object.entries(result).map(([k, v]) => (
            <Row key={k} k={k} v={formatFieldValue(v)} />
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const Row: React.FC<{k: string; v: string}> = ({k, v}) => (
  <View style={styles.row}>
    <Text style={styles.rowKey}>{k}</Text>
    <Text style={styles.rowVal}>{v}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: theme.bg},
  lockScreen: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
    backgroundColor: theme.bg,
  },
  lockTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: theme.text,
    textAlign: 'center',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  lockSub: {
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 24,
  },
  input: {
    borderWidth: 0.5,
    borderColor: theme.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: theme.surfaceAlt,
    color: theme.text,
    marginBottom: space.md,
    fontSize: 14,
  },
  btn: {
    backgroundColor: theme.accent,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    marginBottom: space.md,
  },
  btnText: {
    color: theme.accentText,
    fontWeight: '600',
    fontSize: 14,
    letterSpacing: 0.8,
  },
  btnGhost: {
    backgroundColor: theme.surface,
    borderWidth: 0.5,
    borderColor: theme.border,
  },
  btnGhostText: {
    color: theme.text,
    fontWeight: '500',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: theme.surface,
    padding: 14,
    borderRadius: radius.md,
    marginTop: space.md,
    borderWidth: 0.5,
    borderColor: theme.border,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textMuted,
    marginBottom: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  row: {flexDirection: 'row', paddingVertical: 4},
  rowKey: {flex: 1, color: theme.textMuted, fontSize: 13},
  rowVal: {flex: 2, color: theme.text, fontSize: 13},
});
