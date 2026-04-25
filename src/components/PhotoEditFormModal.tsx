import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {DynamicFormRenderer} from './DynamicFormRenderer';
import {FormConfig, FieldValue, GeoLocation} from '../types';
import {getFormConfigForPhoto} from '../database/formConfigs';
import {JobPhotoRow, updateJobPhotoData} from '../database/jobHistory';
import {processFormData} from '../security/encryption';
import {writeExif} from '../security/exif';
import {theme, radius} from '../theme';

interface Props {
  visible: boolean;
  photo: JobPhotoRow | null;
  /**
   * ฟิลด์ sensitive ที่ปลดล็อกแล้ว — keyed by label (ตรงกับ processFormData)
   * null = ยังไม่ได้ unlock → ถ้าภาพมี cipher ไม่ควรเปิด modal นี้
   */
  decrypted: Record<string, any> | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

/**
 * Edit metadata ของภาพ โดยรียูส DynamicFormRenderer ตัวเดียวกับหน้ากล้อง
 * — UI + validation + dropdown/autocomplete เหมือนกันทุกอย่าง
 *
 * สำคัญ: เวลาบันทึกจะ
 *   - ใช้ capturedAt เดิมเป็น processedAt (ไม่เปลี่ยนเวลาถ่าย)
 *   - ใช้ latitude/longitude/accuracy เดิม (ไม่เปลี่ยนพิกัด)
 *   - re-encrypt ใหม่ → iv/mac ใหม่
 *   - เขียน EXIF UserComment ใหม่ + ตั้ง editedAt = now
 */
export const PhotoEditFormModal: React.FC<Props> = ({
  visible,
  photo,
  decrypted,
  onClose,
  onSaved,
}) => {
  const [config, setConfig] = useState<FormConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialValues, setInitialValues] = useState<Record<string, any>>({});
  // true = ฟอร์มที่โหลดมาเป็น fallback (active form) ไม่ใช่ฟอร์มเดิมตอนถ่าย
  // ใช้แสดง banner เตือน + อาจมีฟิลด์ไม่ตรงกับตอนถ่าย
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    if (!visible || !photo) {
      setConfig(null);
      setInitialValues({});
      setIsFallback(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const cfg = await getFormConfigForPhoto(photo.id);
        if (cancelled) return;
        if (!cfg) {
          setConfig(null);
          setInitialValues({});
          setIsFallback(false);
          return;
        }
        // รวมข้อมูลปัจจุบัน (public + decrypted) แล้ว map label → field.id
        const currentAll: Record<string, any> = {
          ...(photo.publicData ?? {}),
          ...(decrypted ?? {}),
        };
        const init: Record<string, any> = {};
        for (const f of cfg.fields) {
          const existing = currentAll[f.label];
          if (existing !== undefined) init[f.id] = existing;
        }
        setConfig(cfg);
        setInitialValues(init);
        // ตรวจว่าเราโหลด fallback form หรือเปล่า
        // — ภาพไม่มี formConfigId บันทึกไว้ หรือไม่ตรงกับ cfg.id
        setIsFallback(
          !photo.formConfigId || photo.formConfigId !== cfg.id,
        );
      } catch (e: any) {
        Alert.alert('Load form failed', e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, photo, decrypted]);

  const handleSubmit = async (values: FieldValue[]) => {
    if (!photo || !config) return;
    setSaving(true);
    try {
      // processFormData: แยก public/sensitive ตาม isEncrypted, encrypt, ทำ MAC
      const processed = await processFormData(values, config.id, config.version);

      // override processedAt ด้วยเวลาเดิม (เพื่อไม่เปลี่ยนเวลาถ่าย)
      // แล้วตั้ง editedAt = now
      const withOriginalTime = {
        ...processed,
        processedAt: photo.capturedAt,
        editedAt: new Date().toISOString(),
      };

      const originalLocation: GeoLocation = {
        latitude: photo.latitude,
        longitude: photo.longitude,
        accuracy: photo.accuracy,
        timestamp: new Date(photo.capturedAt).getTime(),
      };

      const filePath = photo.filePath.replace(/^file:\/\//, '');
      await writeExif(filePath, withOriginalTime, originalLocation);

      await updateJobPhotoData(
        photo.id,
        withOriginalTime.public,
        withOriginalTime.private,
        withOriginalTime.iv ?? null,
        withOriginalTime.mac ?? null,
        // back-fill: ถ้าภาพยังไม่มี form_config_id (เช่นภาพเก่า legacy)
        // จะเขียนค่า config.id ล่าสุดที่ใช้แก้ไขเข้าไป — ครั้งหน้าจะ
        // ผูกฟอร์มได้ตรงไม่ต้อง fallback
        config.id,
      );

      await onSaved();
      Alert.alert('Saved', 'Photo metadata updated.');
      onClose();
    } catch (e: any) {
      Alert.alert('Save failed', e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={12}
            disabled={saving}
            style={styles.modalCloseBtn}>
            <Text style={styles.modalClose}>✕</Text>
          </TouchableOpacity>
          <View style={{flex: 1}}>
            <Text style={styles.modalTitle}>
              {config ? `Edit · ${config.name}` : 'Edit metadata'}
            </Text>
            {config && (
              <Text style={styles.modalSubtitle}>
                {config.fields.length}{' '}
                {config.fields.length === 1 ? 'field' : 'fields'}
                {'  ·  v'}
                {config.version}
              </Text>
            )}
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.text} />
            <Text style={styles.centerText}>Loading form…</Text>
          </View>
        ) : !config ? (
          <View style={styles.center}>
            <Text style={styles.centerTitle}>No form available</Text>
            <Text style={styles.centerText}>
              There is no active form in the Form tab yet. Please create or
              activate a form there first, then come back to edit this photo.
            </Text>
          </View>
        ) : (
          <>
            {isFallback && (
              <View style={styles.fallbackBanner}>
                <Text style={styles.fallbackBannerText}>
                  Using the currently active form. Fields that didn't exist
                  when this photo was taken will start empty.
                </Text>
              </View>
            )}
            <DynamicFormRenderer
              config={config}
              initialValues={initialValues}
              onSubmit={handleSubmit}
              submitLabel={saving ? 'Saving…' : 'Save changes'}
            />
          </>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  centerTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  centerText: {
    color: theme.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  fallbackBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  fallbackBannerText: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.3,
  },
});
