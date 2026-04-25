import React, {useRef, useState, useCallback} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
} from 'react-native-vision-camera';
import {useLocation} from '../hooks/useLocation';
import {useCameraPermission} from '../hooks/useCameraPermission';
import {DynamicFormRenderer} from '../components/DynamicFormRenderer';
import {FormConfig, FieldValue, JobPhoto} from '../types';
import {getActiveFormConfig} from '../database/formConfigs';
import {DEFAULT_FORM} from '../config/defaultForm';
import {processFormData} from '../security/encryption';
import {writeExif} from '../security/exif';
import {addJobPhoto} from '../database/jobHistory';
import {generateId} from '../utils/id';
import {nowIso} from '../utils/datetime';
import {theme, radius} from '../theme';

/**
 * Main #1 — Camera Screen
 * Flow:
 * 1. Show preview + overlays (GPS, timestamp, form name)
 * 2. Shutter → capture → show form modal
 * 3. On submit → encrypt flagged fields → embed EXIF → save JobPhoto
 */
export const CameraScreen: React.FC = () => {
  const permission = useCameraPermission();
  const device = useCameraDevice('back');
  const format = useCameraFormat(device, [
    {photoResolution: {width: 1920, height: 1080}},
  ]);
  const cameraRef = useRef<Camera>(null);
  const {location, error: locError} = useLocation(true);

  const [form, setForm] = useState<FormConfig>(DEFAULT_FORM);
  const [pendingPhotoPath, setPendingPhotoPath] = useState<string | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reload active form every time the Camera tab gains focus — so edits
  // made in the Form tab show up immediately on return.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const active = await getActiveFormConfig().catch(() => null);
        if (!cancelled && active) setForm(active);
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || busy) return;
    if (!location) {
      Alert.alert('No location yet', 'Waiting for GPS signal — try again.');
      return;
    }
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePhoto({
        enableShutterSound: true,
      });
      setPendingPhotoPath('file://' + photo.path);
      setFormVisible(true);
    } catch (e: any) {
      Alert.alert('Capture failed', e.message);
    } finally {
      setBusy(false);
    }
  }, [busy, location]);

  const handleDiscardPhoto = useCallback(() => {
    if (busy) return; // ห้ามปิดระหว่างกำลังบันทึก
    Alert.alert(
      'Discard photo?',
      'The captured image and any entered data will be thrown away.',
      [
        {text: 'Keep editing', style: 'cancel'},
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setFormVisible(false);
            setPendingPhotoPath(null);
          },
        },
      ],
    );
  }, [busy]);

  const handleFormSubmit = async (values: FieldValue[]) => {
    if (!pendingPhotoPath || !location) return;
    setBusy(true);
    try {
      const processed = await processFormData(values, form.id, form.version);
      await writeExif(
        pendingPhotoPath.replace('file://', ''),
        processed,
        location,
      );

      const photo: JobPhoto = {
        id: generateId(),
        jobId: 'pending',
        filePath: pendingPhotoPath,
        location,
        capturedAt: nowIso(),
      };
      await addJobPhoto(
        photo,
        processed.public,
        processed.private,
        processed.iv ?? null,
        processed.mac ?? null,
        form.id,
      );

      setFormVisible(false);
      setPendingPhotoPath(null);
      Alert.alert('Saved', 'Photo tagged with metadata and encrypted.');
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  if (permission !== 'granted') {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>Camera permission required</Text>
      </View>
    );
  }
  if (!device) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.text} />
        <Text style={styles.centerText}>Preparing camera…</Text>
      </View>
    );
  }

  const now = new Date();
  const stamp = now.toISOString().slice(0, 19).replace('T', '  ');

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive
        photo
      />

      {/* Top overlay — timestamp + GPS + form name */}
      <View style={styles.topOverlay}>
        <Text style={styles.overlayText}>{stamp}</Text>
        {location ? (
          <Text style={styles.overlayText}>
            {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
            {location.accuracy
              ? `   ±${Math.round(location.accuracy)}m`
              : ''}
          </Text>
        ) : (
          <Text style={[styles.overlayText, styles.overlayDim]}>
            Searching GPS{locError ? ` — ${locError}` : '…'}
          </Text>
        )}
        <Text style={styles.overlayFormName}>
          {form.name}  ·  {form.fields.length}{' '}
          {form.fields.length === 1 ? 'field' : 'fields'}
        </Text>
      </View>

      {/* Shutter */}
      <View style={styles.bottomOverlay}>
        <TouchableOpacity
          style={[styles.shutter, busy && {opacity: 0.5}]}
          disabled={busy}
          onPress={handleCapture}
          activeOpacity={0.7}>
          {busy ? (
            <ActivityIndicator color={theme.accentText} />
          ) : (
            <View style={styles.shutterInner} />
          )}
        </TouchableOpacity>
      </View>

      {/* Form modal */}
      <Modal
        visible={formVisible}
        animationType="slide"
        onRequestClose={handleDiscardPhoto}
        statusBarTranslucent>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={handleDiscardPhoto}
              hitSlop={12}
              style={styles.modalCloseBtn}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
            <View style={{flex: 1}}>
              <Text style={styles.modalTitle}>{form.name}</Text>
              <Text style={styles.modalSubtitle}>
                {form.fields.length}{' '}
                {form.fields.length === 1 ? 'field' : 'fields'}
                {'  ·  v'}
                {form.version}
              </Text>
            </View>
          </View>

          {form.fields.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No fields in this form</Text>
              <Text style={styles.emptyHint}>
                Open the Form tab and add fields first.
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => {
                  // skip form — save without metadata
                  handleFormSubmit([]);
                }}
                activeOpacity={0.7}>
                <Text style={styles.emptyBtnText}>
                  Save photo without data
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.emptyBtn, styles.emptyBtnGhost]}
                onPress={() => {
                  setFormVisible(false);
                  setPendingPhotoPath(null);
                }}
                activeOpacity={0.7}>
                <Text style={styles.emptyBtnGhostText}>Discard photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <DynamicFormRenderer
              config={form}
              onSubmit={handleFormSubmit}
              submitLabel="Save & Embed"
            />
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: theme.bg},
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.bg,
  },
  centerText: {color: theme.text, marginTop: 8},
  topOverlay: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    backgroundColor: theme.overlay,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  overlayText: {
    color: theme.text,
    fontSize: 12,
    marginVertical: 1,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.4,
  },
  overlayDim: {color: theme.textMuted},
  overlayFormName: {
    color: theme.text,
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 3,
    borderColor: theme.text,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: theme.text,
  },
  modal: {flex: 1, paddingTop: 48, backgroundColor: theme.bg},
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    borderColor: theme.border,
    marginBottom: 8,
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
    marginLeft: -8,
  },
  modalClose: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '400',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
    letterSpacing: 0.5,
  },
  modalSubtitle: {
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 4,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  emptyState: {
    flex: 1,
    padding: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  emptyHint: {
    color: theme.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyBtn: {
    backgroundColor: theme.accent,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    alignItems: 'center',
    minWidth: 240,
    marginBottom: 10,
  },
  emptyBtnText: {
    color: theme.accentText,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  emptyBtnGhost: {
    backgroundColor: theme.surface,
    borderWidth: 0.5,
    borderColor: theme.border,
  },
  emptyBtnGhostText: {
    color: theme.text,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});
