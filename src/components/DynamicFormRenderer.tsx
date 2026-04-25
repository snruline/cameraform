import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Switch,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import {
  FieldConfig,
  FieldValue,
  FormConfig,
  ChoiceValue,
  isChoiceValue,
} from '../types';
import {getMasterData, MasterDataRow} from '../database/masterData';
import {theme, radius, space} from '../theme';

interface Props {
  config: FormConfig;
  onSubmit: (values: FieldValue[]) => void;
  submitLabel?: string;
  /**
   * Pre-populate form — keyed by field.id
   * ใช้กับ edit flow: ส่ง initial values มาจากข้อมูลเดิมของภาพ
   */
  initialValues?: Record<string, any>;
}

/**
 * Render an input form from a JSON FormConfig for users to fill.
 */
export const DynamicFormRenderer: React.FC<Props> = ({
  config,
  onSubmit,
  submitLabel = 'Submit',
  initialValues,
}) => {
  const [values, setValues] = useState<Record<string, any>>(
    () => initialValues ?? {},
  );

  // ถ้า initialValues มาใหม่ (เปลี่ยนภาพใน edit modal) → sync
  useEffect(() => {
    if (initialValues) setValues(initialValues);
  }, [initialValues]);

  const setValue = (fieldId: string, v: any) =>
    setValues(prev => ({...prev, [fieldId]: v}));

  const handleSubmit = () => {
    const result: FieldValue[] = config.fields
      .sort((a, b) => a.order - b.order)
      .map(f => ({
        fieldId: f.id,
        label: f.label,
        value: values[f.id] ?? null,
        isEncrypted: f.isEncrypted,
      }));
    onSubmit(result);
  };

  return (
    <ScrollView
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{paddingBottom: 48}}>
      {config.fields
        .sort((a, b) => a.order - b.order)
        .map(field => (
          <FieldRenderer
            key={field.id}
            field={field}
            value={values[field.id]}
            onChange={v => setValue(field.id, v)}
          />
        ))}

      <TouchableOpacity
        style={styles.submit}
        onPress={handleSubmit}
        activeOpacity={0.7}>
        <Text style={styles.submitText}>{submitLabel}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

interface FieldProps {
  field: FieldConfig;
  value: any;
  onChange: (v: any) => void;
}

export const FieldRenderer: React.FC<FieldProps> = ({field, value, onChange}) => {
  const renderLabel = () => (
    <View style={styles.labelRow}>
      <Text style={styles.label}>
        {field.label}
        {field.required && <Text style={{color: theme.danger}}> *</Text>}
      </Text>
      {field.isEncrypted && <Text style={styles.lock}>encrypted</Text>}
    </View>
  );

  switch (field.type) {
    case 'text':
    case 'number':
      return (
        <View style={styles.field}>
          {renderLabel()}
          <TextInput
            style={styles.input}
            value={value ?? ''}
            placeholder={field.placeholder}
            placeholderTextColor={theme.placeholder}
            keyboardType={field.type === 'number' ? 'numeric' : 'default'}
            onChangeText={onChange}
          />
        </View>
      );

    case 'textarea':
      return (
        <View style={styles.field}>
          {renderLabel()}
          <TextInput
            style={[styles.input, {height: 100, textAlignVertical: 'top'}]}
            value={value ?? ''}
            placeholder={field.placeholder}
            placeholderTextColor={theme.placeholder}
            multiline
            onChangeText={onChange}
          />
        </View>
      );

    case 'checkbox':
    case 'toggle':
      return (
        <View style={[styles.field, styles.switchField]}>
          {renderLabel()}
          <Switch
            value={!!value}
            onValueChange={onChange}
            trackColor={{false: theme.border, true: theme.text}}
            thumbColor={value ? theme.bg : theme.textMuted}
          />
        </View>
      );

    case 'select':
      return <SelectField field={field} value={value} onChange={onChange} />;

    case 'autocomplete':
      return (
        <AutocompleteField field={field} value={value} onChange={onChange} />
      );

    default:
      return null;
  }
};

/**
 * Select field — กด input → เปิด Modal overlay เลือก option
 * เปลี่ยนจาก flow-based inline เป็น Modal overlay เพื่อให้สอดคล้องกับ
 * Gallery TILE LABEL picker + ไม่ดัน content ด้านล่างลงเวลาเปิด
 *
 * ทำไม Modal ไม่เจอปัญหา z-index / clipping แบบ absolute positioning:
 * React Native's <Modal> render นอก view hierarchy ปกติ — ไม่ถูก clip
 * โดย ScrollView / parent view ใดๆ
 */
const SelectField: React.FC<FieldProps> = ({field, value, onChange}) => {
  const [open, setOpen] = useState(false);
  const opts = field.options ?? [];
  // value เป็น ChoiceValue สำหรับข้อมูลใหม่ — แต่ยังรองรับ primitive ของเดิม
  const currentVal: string | null = isChoiceValue(value)
    ? value.value
    : value != null
    ? String(value)
    : null;
  const selected = opts.find(o => o.value === currentVal);

  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {field.label}
          {field.required && <Text style={{color: theme.danger}}> *</Text>}
        </Text>
        {field.isEncrypted && <Text style={styles.lock}>encrypted</Text>}
      </View>
      <TouchableOpacity
        style={[styles.input, styles.selectBox]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}>
        <Text
          style={selected ? styles.selectText : styles.selectPlaceholder}
          numberOfLines={1}>
          {selected?.label ?? field.placeholder ?? 'Select…'}
        </Text>
        <Text style={styles.caret}>▾</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <TouchableOpacity
          style={styles.pickerBackdrop}
          activeOpacity={1}
          onPress={() => setOpen(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>{field.label}</Text>
            {opts.length === 0 ? (
              <Text style={styles.pickerEmpty}>
                No options defined — add them in the Form tab.
              </Text>
            ) : (
              <ScrollView style={{maxHeight: 320}}>
                {opts.map(opt => {
                  const isActive = currentVal === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => {
                        const choice: ChoiceValue = {
                          label: opt.label,
                          value: opt.value,
                        };
                        onChange(choice);
                        setOpen(false);
                      }}
                      activeOpacity={0.7}
                      style={[
                        styles.pickerRow,
                        isActive && styles.pickerRowActive,
                      ]}>
                      <Text
                        style={[
                          styles.pickerRowText,
                          isActive && styles.pickerRowTextActive,
                        ]}
                        numberOfLines={1}>
                        {opt.label}
                      </Text>
                      {isActive && <Text style={styles.pickerCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

/**
 * Autocomplete field — Modal overlay ที่มี TextInput ค้นหา + list suggestion
 * ใช้ pattern เดียวกับ SelectField (Modal overlay) เพื่อ UI สอดคล้องกัน
 * ไม่ดัน content ด้านล่างลง และหลบ z-index/clipping bug บน Android
 *
 * หมายเหตุ: แยก committedLabel (ค่าที่บันทึกจริง/แสดงบนปุ่ม) ออกจาก query
 * (ค่าใน TextInput ภายใน Modal) เพื่อให้ state ใน Modal ไม่ lieak กลับไปก่อน
 * ผู้ใช้กดยืนยัน
 */
const AutocompleteField: React.FC<FieldProps> = ({field, value, onChange}) => {
  // hydrate จาก value เดิม: ถ้าเป็น ChoiceValue ใช้ label, ถ้าเป็น string ใช้ตรง ๆ
  const initialLabel = isChoiceValue(value)
    ? value.label
    : value != null
    ? String(value)
    : '';
  const [committedLabel, setCommittedLabel] = useState<string>(initialLabel);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<MasterDataRow[]>([]);

  // sync จาก parent — กรณี form re-render ด้วย initialValues ใหม่
  useEffect(() => {
    const next = isChoiceValue(value)
      ? value.label
      : value != null
      ? String(value)
      : '';
    setCommittedLabel(next);
  }, [value]);

  // เปิด Modal → pre-fill query ด้วย committedLabel เพื่อให้ผู้ใช้แก้ไขต่อจากค่าเดิมได้
  useEffect(() => {
    if (open) setQuery(committedLabel);
  }, [open, committedLabel]);

  // โหลด suggestion เมื่อ query เปลี่ยน (เฉพาะตอน Modal เปิด)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      if (!field.source) {
        setSuggestions([]);
        return;
      }
      const rows = await getMasterData(field.source, query);
      if (!cancelled) setSuggestions(rows);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [query, field.source, open]);

  const pick = (row: MasterDataRow) => {
    // บันทึกเป็น ChoiceValue — เก็บทั้ง label + value
    const choice: ChoiceValue = {label: row.label, value: row.value};
    setCommittedLabel(row.label);
    onChange(choice);
    setOpen(false);
  };

  // ผู้ใช้พิมพ์ข้อความที่ไม่ตรงกับ master data → commit เป็น label-only ChoiceValue
  // (รักษาพฤติกรรมเดิมที่อนุญาตให้ free-text ได้)
  const commitAndClose = () => {
    const trimmed = query.trim();
    if (trimmed !== committedLabel) {
      setCommittedLabel(trimmed);
      onChange(trimmed ? {label: trimmed, value: ''} : null);
    }
    setOpen(false);
  };

  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {field.label}
          {field.required && <Text style={{color: theme.danger}}> *</Text>}
        </Text>
        {field.isEncrypted && <Text style={styles.lock}>encrypted</Text>}
      </View>
      <TouchableOpacity
        style={[styles.input, styles.selectBox]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}>
        <Text
          style={committedLabel ? styles.selectText : styles.selectPlaceholder}
          numberOfLines={1}>
          {committedLabel || field.placeholder || 'Type to search…'}
        </Text>
        <Text style={styles.caret}>▾</Text>
      </TouchableOpacity>
      {!field.source && (
        <Text style={styles.hint}>
          No data source configured — set &ldquo;source&rdquo; in the Form tab.
        </Text>
      )}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={commitAndClose}>
        <TouchableOpacity
          style={styles.pickerBackdrop}
          activeOpacity={1}
          onPress={commitAndClose}>
          {/* block tap-through ตอนแตะในช่อง card (เช่น blank space ระหว่าง
              TextInput กับ list) — ไม่งั้น modal จะปิดโดยไม่ตั้งใจ */}
          <View
            style={styles.pickerCard}
            onStartShouldSetResponder={() => true}>
            <Text style={styles.pickerTitle}>{field.label}</Text>
            <TextInput
              style={[styles.input, styles.pickerInput]}
              value={query}
              placeholder={field.placeholder ?? 'Type to search…'}
              placeholderTextColor={theme.placeholder}
              onChangeText={setQuery}
              autoFocus
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={commitAndClose}
            />
            {!field.source ? (
              <Text style={styles.pickerEmpty}>
                No data source configured — set &ldquo;source&rdquo; in the
                Form tab.
              </Text>
            ) : (
              <ScrollView
                style={{maxHeight: 320}}
                keyboardShouldPersistTaps="handled">
                {suggestions.slice(0, 20).map((row, idx) => {
                  const isActive = row.label === committedLabel;
                  return (
                    <TouchableOpacity
                      key={`${row.id}-${idx}`}
                      onPress={() => pick(row)}
                      activeOpacity={0.7}
                      style={[
                        styles.pickerRow,
                        isActive && styles.pickerRowActive,
                      ]}>
                      <Text
                        style={[
                          styles.pickerRowText,
                          isActive && styles.pickerRowTextActive,
                        ]}
                        numberOfLines={1}>
                        {row.label}
                      </Text>
                      {isActive && <Text style={styles.pickerCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
                {/* ไม่มี suggestion แต่ผู้ใช้พิมพ์ค่าใหม่ → ให้เลือก "Use 'xxx'" */}
                {suggestions.length === 0 && query.trim().length > 0 && (
                  <TouchableOpacity
                    onPress={commitAndClose}
                    activeOpacity={0.7}
                    style={styles.pickerRow}>
                    <Text style={styles.pickerRowText} numberOfLines={1}>
                      Use &ldquo;{query.trim()}&rdquo;
                    </Text>
                  </TouchableOpacity>
                )}
                {suggestions.length === 0 && query.trim().length === 0 && (
                  <Text style={styles.pickerEmpty}>
                    No suggestions — check master data for &ldquo;
                    {field.source}&rdquo;.
                  </Text>
                )}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, padding: space.lg, backgroundColor: theme.bg},
  field: {marginBottom: 16},
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  lock: {
    fontSize: 10,
    color: theme.encrypted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // View-only (สำหรับ Autocomplete inputContainerStyle — ห้ามมี color/fontSize)
  inputBox: {
    backgroundColor: theme.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 0.5,
    borderColor: theme.border,
  },
  // Text-only (สำหรับ TextInput ภายใน Autocomplete)
  inputText: {
    color: theme.text,
    fontSize: 14,
  },
  // Mixed (สำหรับ TextInput ธรรมดา — รับทั้ง view และ text style ได้)
  input: {
    backgroundColor: theme.surfaceAlt,
    color: theme.text,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 0.5,
    borderColor: theme.border,
    fontSize: 14,
  },
  switchField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // Select dropdown — ใช้ styles.input เป็น base แล้ว overlay ส่วน layout
  selectBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectText: {
    color: theme.text,
    fontSize: 14,
    flex: 1,
  },
  selectPlaceholder: {
    color: theme.placeholder,
    fontSize: 14,
    flex: 1,
  },
  caret: {
    color: theme.textMuted,
    fontSize: 12,
    marginLeft: 8,
  },
  hint: {
    color: theme.textMuted,
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
  submit: {
    backgroundColor: theme.accent,
    padding: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: space.lg,
  },
  submitText: {
    color: theme.accentText,
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: 0.8,
  },

  // --- Select picker overlay (Modal) — match Gallery tile-label picker ---
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: space.lg,
  },
  pickerCard: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: theme.border,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
  },
  pickerTitle: {
    color: theme.textMuted,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: space.sm,
    paddingTop: 4,
    paddingBottom: space.sm,
  },
  pickerEmpty: {
    color: theme.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  pickerInput: {
    marginBottom: space.sm,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  pickerRowActive: {
    backgroundColor: theme.accent,
  },
  pickerRowText: {
    color: theme.text,
    fontSize: 13,
    letterSpacing: 0.3,
    flex: 1,
  },
  pickerRowTextActive: {
    color: theme.accentText,
    fontWeight: '600',
  },
  pickerCheck: {
    color: theme.accentText,
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
});
