import React, {useEffect, useState} from 'react';
import {View, Text, Alert, ActivityIndicator, StyleSheet} from 'react-native';
import {FormBuilder} from '../components/FormBuilder';
import {FormConfig} from '../types';
import {getActiveFormConfig, saveFormConfig} from '../database/formConfigs';
import {DEFAULT_FORM} from '../config/defaultForm';
import {theme} from '../theme';

export const FormBuilderScreen: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<FormConfig | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const active = await getActiveFormConfig();
        setConfig(active ?? DEFAULT_FORM);
      } catch {
        setConfig(DEFAULT_FORM);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async (next: FormConfig) => {
    try {
      await saveFormConfig(next);
      setConfig(next);
      Alert.alert('Saved', 'Form updated.');
    } catch (e: any) {
      Alert.alert('Save failed', e.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.text} />
        <Text style={styles.text}>Loading…</Text>
      </View>
    );
  }

  return <FormBuilder initialConfig={config!} onSave={handleSave} />;
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.bg,
  },
  text: {color: theme.textMuted, marginTop: 8},
});
