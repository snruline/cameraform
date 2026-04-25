import React, {useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Switch,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {FieldConfig, FieldType, FormConfig} from '../types';
import {generateId} from '../utils/id';
import {theme, radius, space} from '../theme';
import {MasterDataManager} from './MasterDataManager';

interface Props {
  initialConfig?: FormConfig;
  onSave: (config: FormConfig) => void;
}

const FIELD_TYPES: {label: string; value: FieldType}[] = [
  {label: 'Text', value: 'text'},
  {label: 'Paragraph', value: 'textarea'},
  {label: 'Number', value: 'number'},
  {label: 'Dropdown', value: 'select'},
  {label: 'Autocomplete', value: 'autocomplete'},
  {label: 'Date', value: 'date'},
  {label: 'Checkbox', value: 'checkbox'},
];

export const FormBuilder: React.FC<Props> = ({initialConfig, onSave}) => {
  const [form, setForm] = useState<FormConfig>(
    initialConfig ?? {
      id: generateId(),
      name: '',
      description: '',
      version: 1,
      fields: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
    },
  );

  // Master Data modal — either open blank, or pre-filtered to a source
  const [dataModal, setDataModal] = useState<{
    open: boolean;
    source?: string;
  }>({open: false});

  const addField = useCallback(() => {
    setForm(prev => ({
      ...prev,
      fields: [
        ...prev.fields,
        {
          id: generateId(),
          type: 'text',
          label: 'New field',
          isEncrypted: false,
          order: prev.fields.length + 1,
          required: false,
        },
      ],
    }));
  }, []);

  const updateField = useCallback(
    (fieldId: string, patch: Partial<FieldConfig>) => {
      setForm(prev => ({
        ...prev,
        fields: prev.fields.map(f =>
          f.id === fieldId ? {...f, ...patch} : f,
        ),
      }));
    },
    [],
  );

  const removeField = useCallback((fieldId: string) => {
    setForm(prev => ({
      ...prev,
      fields: prev.fields.filter(f => f.id !== fieldId),
    }));
  }, []);

  const handleSave = () => {
    if (!form.name.trim()) {
      Alert.alert('Form name required');
      return;
    }
    onSave({
      ...form,
      updatedAt: new Date().toISOString(),
      version: form.version + 1,
    });
  };

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{paddingBottom: 48}}>
        <Text style={styles.sectionTitle}>Form</Text>

        <TextInput
          style={styles.input}
          placeholder="Form name"
          placeholderTextColor={theme.placeholder}
          value={form.name}
          onChangeText={t => setForm({...form, name: t})}
        />
        <TextInput
          style={[styles.input, {height: 72, textAlignVertical: 'top'}]}
          placeholder="Description (optional)"
          placeholderTextColor={theme.placeholder}
          value={form.description}
          multiline
          onChangeText={t => setForm({...form, description: t})}
        />

        <Text style={styles.sectionTitle}>
          Fields  <Text style={styles.sectionCount}>{form.fields.length}</Text>
        </Text>

        {form.fields.map((field, index) => (
          <FieldEditor
            key={field.id}
            index={index}
            field={field}
            onChange={patch => updateField(field.id, patch)}
            onRemove={() => removeField(field.id)}
            onOpenDataSource={src => setDataModal({open: true, source: src})}
          />
        ))}

        <TouchableOpacity
          style={styles.addBtn}
          onPress={addField}
          activeOpacity={0.7}>
          <Text style={styles.addBtnText}>+  Add field</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          activeOpacity={0.7}>
          <Text style={styles.saveBtnText}>Save form</Text>
        </TouchableOpacity>
      </ScrollView>

      <MasterDataManager
        visible={dataModal.open}
        initialSource={dataModal.source}
        onClose={() => setDataModal({open: false})}
      />
    </>
  );
};

interface FieldEditorProps {
  index: number;
  field: FieldConfig;
  onChange: (patch: Partial<FieldConfig>) => void;
  onRemove: () => void;
  onOpenDataSource: (source: string) => void;
}

const FieldEditor: React.FC<FieldEditorProps> = ({
  index,
  field,
  onChange,
  onRemove,
  onOpenDataSource,
}) => {
  const updateOption = (i: number, patch: {label?: string; value?: string}) => {
    const opts = [...(field.options ?? [])];
    opts[i] = {...opts[i], ...patch};
    onChange({options: opts});
  };
  const addOption = () => {
    const opts = [...(field.options ?? []), {label: '', value: ''}];
    onChange({options: opts});
  };
  const removeOption = (i: number) => {
    const opts = (field.options ?? []).filter((_, idx) => idx !== i);
    onChange({options: opts});
  };

  return (
    <View style={styles.fieldBox}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldIndex}>#{index + 1}</Text>
        <TouchableOpacity onPress={onRemove} hitSlop={10}>
          <Text style={styles.removeText}>Remove</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Label</Text>
      <TextInput
        style={styles.input}
        value={field.label}
        placeholderTextColor={theme.placeholder}
        onChangeText={t => onChange({label: t})}
      />

      <Text style={styles.label}>Type</Text>
      <View style={styles.typeRow}>
        {FIELD_TYPES.map(t => (
          <TouchableOpacity
            key={t.value}
            style={[
              styles.typeChip,
              field.type === t.value && styles.typeChipActive,
            ]}
            onPress={() => onChange({type: t.value})}>
            <Text
              style={[
                styles.typeChipText,
                field.type === t.value && styles.typeChipTextActive,
              ]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.label}>Required</Text>
        <Switch
          value={!!field.required}
          onValueChange={v => onChange({required: v})}
          trackColor={{false: theme.border, true: theme.text}}
          thumbColor={field.required ? theme.bg : theme.textMuted}
        />
      </View>

      <View style={styles.switchRow}>
        <Text style={[styles.label, {color: theme.encrypted}]}>
          Encrypt (PDPA)
        </Text>
        <Switch
          value={field.isEncrypted}
          onValueChange={v => onChange({isEncrypted: v})}
          trackColor={{false: theme.border, true: theme.encrypted}}
          thumbColor={field.isEncrypted ? theme.bg : theme.textMuted}
        />
      </View>

      {/* Dropdown (select) — inline options editor */}
      {field.type === 'select' && (
        <View style={styles.optionsBox}>
          <Text style={styles.label}>Options</Text>
          {(field.options ?? []).map((opt, i) => (
            <View key={i} style={styles.optionRow}>
              <TextInput
                style={[styles.input, styles.optionInput]}
                value={opt.label}
                placeholder="Label shown to user"
                placeholderTextColor={theme.placeholder}
                onChangeText={t => updateOption(i, {label: t})}
              />
              <TextInput
                style={[styles.input, styles.optionInput]}
                value={opt.value}
                placeholder="Stored value"
                placeholderTextColor={theme.placeholder}
                onChangeText={t => updateOption(i, {value: t})}
              />
              <TouchableOpacity
                onPress={() => removeOption(i)}
                style={styles.optionRemove}
                hitSlop={8}>
                <Text style={styles.removeText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            style={styles.optionAddBtn}
            onPress={addOption}
            activeOpacity={0.7}>
            <Text style={styles.optionAddText}>+  Add option</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Autocomplete — master data source */}
      {field.type === 'autocomplete' && (
        <View style={styles.optionsBox}>
          <Text style={styles.label}>Data source</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. contacts, cases"
            placeholderTextColor={theme.placeholder}
            value={field.source ?? ''}
            onChangeText={t => onChange({source: t})}
            autoCapitalize="none"
          />
          {field.source && field.source.trim().length > 0 && (
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => onOpenDataSource(field.source!.trim())}
              activeOpacity={0.7}>
              <Text style={styles.linkBtnText}>
                Manage "{field.source}" data →
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, padding: space.lg, backgroundColor: theme.bg},
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  sectionCount: {
    color: theme.textDim,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  input: {
    backgroundColor: theme.surfaceAlt,
    color: theme.text,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 0.5,
    borderColor: theme.border,
    marginBottom: space.sm,
    fontSize: 14,
  },
  fieldBox: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: space.md,
    borderWidth: 0.5,
    borderColor: theme.border,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  fieldIndex: {
    color: theme.textMuted,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  removeText: {color: theme.danger, fontWeight: '500', fontSize: 14},
  label: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 8,
    marginBottom: 4,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  typeRow: {flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4},
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.surfaceAlt,
    borderRadius: 14,
    margin: 3,
    borderWidth: 0.5,
    borderColor: theme.border,
  },
  typeChipActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  typeChipText: {color: theme.textMuted, fontSize: 12},
  typeChipTextActive: {color: theme.accentText, fontWeight: '600'},
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  optionsBox: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderColor: theme.border,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  optionInput: {
    flex: 1,
    marginBottom: 0,
    marginRight: 6,
    paddingVertical: 8,
  },
  optionRemove: {paddingHorizontal: 8, paddingVertical: 6},
  optionAddBtn: {
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 4,
    borderWidth: 0.5,
    borderStyle: 'dashed',
    borderColor: theme.border,
    borderRadius: radius.sm,
  },
  optionAddText: {color: theme.textMuted, fontSize: 12, letterSpacing: 0.5},
  linkBtn: {paddingVertical: 6},
  linkBtnText: {
    color: theme.text,
    fontSize: 12,
    letterSpacing: 0.5,
    textDecorationLine: 'underline',
  },
  addBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.borderStrong,
    padding: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: space.sm,
  },
  addBtnText: {color: theme.text, fontWeight: '500', letterSpacing: 0.5},
  saveBtn: {
    backgroundColor: theme.accent,
    padding: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: space.lg,
  },
  saveBtnText: {
    color: theme.accentText,
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: 0.8,
  },
});
