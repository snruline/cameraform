import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  TextInput,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import {FlashList} from '@shopify/flash-list';
import RNFS from 'react-native-fs';
import {useFocusEffect} from '@react-navigation/native';
import {
  JobPhotoRow,
  listJobPhotos,
  deleteJobPhoto,
} from '../database/jobHistory';
import {decryptString} from '../security/encryption';
import {
  verifyViewerPassphrase,
  hasViewerPassphrase,
  setViewerPassphrase,
} from '../security/keyManager';
import {formatFieldValue} from '../types';
import {ZoomableImage} from '../components/ZoomableImage';
import {PhotoEditFormModal} from '../components/PhotoEditFormModal';
import {theme, radius, space} from '../theme';

/**
 * Gallery — รายการภาพที่ถ่ายผ่านแอปทั้งหมด (ล่าสุดก่อน)
 *
 * Public metadata แสดงได้เลยไม่ต้องใส่ passphrase
 * ฟิลด์ที่เข้ารหัสไว้ต้องกดปลดล็อกและใส่ passphrase 1 ครั้งต่อ session
 *
 * ภาพที่ไฟล์ถูก OS ลบจาก cache/tmp แล้ว จะถูกทำเครื่องหมาย "missing"
 * (แต่ยังเห็น metadata ใน DB ได้ — ใช้ตัดสินใจว่าจะลบ record ทิ้งหรือไม่)
 */

// session-scoped flag — ปลดแล้วคงอยู่จนปิดแอป
let sessionUnlocked = false;

interface PhotoWithStatus extends JobPhotoRow {
  missing: boolean;
}

type GridColumns = 2 | 3 | 4;

/**
 * ป้ายใต้ภาพ:
 *   null = วันเวลาที่ถ่าย (ค่า default)
 *   string = ชื่อ label ของฟิลด์ public — จะอ่านค่าจาก publicData[label]
 */
type TileLabel = string | null;

export const GalleryScreen: React.FC = () => {
  const [items, setItems] = useState<PhotoWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<PhotoWithStatus | null>(null);
  const [columns, setColumns] = useState<GridColumns>(2);
  const [labelField, setLabelField] = useState<TileLabel>(null);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);

  const load = useCallback(async () => {
    const rows = await listJobPhotos(500);
    const withStatus = await Promise.all(
      rows.map(async (r: JobPhotoRow) => {
        const path = r.filePath.replace(/^file:\/\//, '');
        const exists = await RNFS.exists(path).catch(() => false);
        return {...r, missing: !exists};
      }),
    );
    setItems(withStatus);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        await load();
        if (!cancelled) setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const removePhoto = useCallback(
    async (photo: PhotoWithStatus) => {
      Alert.alert(
        'Delete record?',
        photo.missing
          ? 'The image file is already missing. Delete the database record too?'
          : 'This will remove the DB record (image file on disk is not deleted).',
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              await deleteJobPhoto(photo.id);
              setSelected(null);
              await load();
            },
          },
        ],
      );
    },
    [load],
  );

  // รวม label ของฟิลด์ public ที่มีอยู่จริงในภาพใด ๆ ก็ได้
  // — เฉพาะฟิลด์ public (ไม่เอา encrypted เพราะต้องปลดล็อกก่อน
  //   และไม่เหมาะจะโชว์บน thumbnail รวมของ gallery)
  // IMPORTANT: hooks ต้องอยู่ก่อน early return (loading/empty) —
  // Rules of Hooks ไม่ให้เรียก conditional
  const publicLabels = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (it.publicData) {
        for (const k of Object.keys(it.publicData)) set.add(k);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  // ถ้า label ที่เลือกไว้หายไปจาก items ใหม่ (เช่นลบภาพสุดท้ายที่มี
  // ฟิลด์นั้น) ให้ fallback กลับเป็น date
  useEffect(() => {
    if (labelField && !publicLabels.includes(labelField)) {
      setLabelField(null);
    }
  }, [publicLabels, labelField]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.text} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No photos yet</Text>
        <Text style={styles.emptyHint}>
          Switch to the Camera tab to take your first photo.
        </Text>
      </View>
    );
  }

  const tileSize =
    Dimensions.get('window').width / columns - space.xs * 2;

  const labelButtonText =
    labelField === null ? 'Label: Date' : `Label: ${labelField}`;

  return (
    <View style={styles.container}>
      <View style={styles.zoomBar}>
        {/* ซ้าย: dropdown เลือกฟิลด์สำหรับป้ายใต้ภาพ */}
        <TouchableOpacity
          onPress={() => setLabelPickerOpen(true)}
          style={styles.labelPickerBtn}
          activeOpacity={0.7}>
          <Text style={styles.labelPickerBtnText} numberOfLines={1}>
            {labelButtonText}
          </Text>
          <Text style={styles.labelPickerCaret}>▾</Text>
        </TouchableOpacity>

        {/* ขวา: เลือกจำนวนคอลัมน์ */}
        <View style={styles.colGroup}>
          {([2, 3, 4] as GridColumns[]).map(n => (
            <TouchableOpacity
              key={n}
              onPress={() => setColumns(n)}
              style={[
                styles.zoomBtn,
                columns === n && styles.zoomBtnActive,
              ]}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.zoomBtnText,
                  columns === n && styles.zoomBtnTextActive,
                ]}>
                {n} cols
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlashList<PhotoWithStatus>
        // key เปลี่ยนตาม columns/labelField เพื่อ force remount —
        // FlashList รองรับ numColumns ได้ แต่ cache estimate ยังชี้ค่าเก่า
        // → ลากก่อนจะกระตุก; เปลี่ยน labelField ก็ rerender ทุก tile อยู่แล้ว
        // แต่ key ช่วยให้ measurement ถูกต้องถ้า label สูงต่างกัน
        key={`grid-${columns}`}
        data={items}
        keyExtractor={item => item.id}
        numColumns={columns}
        estimatedItemSize={tileSize + 30}
        extraData={labelField}
        contentContainerStyle={{padding: space.xs}}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.text}
            colors={[theme.text]}
          />
        }
        renderItem={({item}) => (
          <Thumbnail
            item={item}
            tileSize={tileSize}
            labelField={labelField}
            onPress={() => setSelected(item)}
          />
        )}
      />

      <DetailModal
        photo={selected}
        onClose={() => setSelected(null)}
        onDelete={removePhoto}
        onUpdated={load}
      />

      {/* Dropdown overlay สำหรับเลือกฟิลด์ที่จะแสดงบน thumbnail */}
      <Modal
        visible={labelPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLabelPickerOpen(false)}>
        <TouchableOpacity
          style={styles.pickerBackdrop}
          activeOpacity={1}
          onPress={() => setLabelPickerOpen(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Tile label</Text>
            <ScrollView style={{maxHeight: 320}}>
              <LabelOption
                label="Date / time"
                active={labelField === null}
                onPress={() => {
                  setLabelField(null);
                  setLabelPickerOpen(false);
                }}
              />
              {publicLabels.length === 0 ? (
                <Text style={styles.pickerEmpty}>
                  No public fields found in any photo yet.
                </Text>
              ) : (
                publicLabels.map(lbl => (
                  <LabelOption
                    key={lbl}
                    label={lbl}
                    active={labelField === lbl}
                    onPress={() => {
                      setLabelField(lbl);
                      setLabelPickerOpen(false);
                    }}
                  />
                ))
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const LabelOption: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({label, active, onPress}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    style={[styles.pickerRow, active && styles.pickerRowActive]}>
    <Text
      style={[styles.pickerRowText, active && styles.pickerRowTextActive]}
      numberOfLines={1}>
      {label}
    </Text>
    {active && <Text style={styles.pickerCheck}>✓</Text>}
  </TouchableOpacity>
);

const Thumbnail: React.FC<{
  item: PhotoWithStatus;
  tileSize: number;
  labelField: TileLabel;
  onPress: () => void;
}> = ({item, tileSize, labelField, onPress}) => {
  const hasCipher = !!(item.cipher && item.iv && item.mac);

  // เลือกค่าป้ายใต้ภาพ:
  //   null → วันเวลาที่ถ่าย
  //   string → publicData[label] (ถ้ามี) แสดงผ่าน formatFieldValue
  //            ถ้าภาพนี้ไม่มีฟิลด์นั้น → "—"
  let captionText: string;
  if (labelField === null) {
    captionText = formatLocal(item.capturedAt);
  } else {
    const v = item.publicData?.[labelField];
    captionText = v === undefined || v === null || v === '' ? '—' : formatFieldValue(v);
  }

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.tile, {width: tileSize}]}>
      {item.missing ? (
        <View style={[styles.thumb, styles.thumbMissing]}>
          <Text style={styles.missingText}>file missing</Text>
        </View>
      ) : (
        <Image source={{uri: item.filePath}} style={styles.thumb} />
      )}
      <View style={styles.tileMeta}>
        <Text style={styles.tileTime} numberOfLines={1}>
          {captionText}
        </Text>
        {hasCipher && <Text style={styles.lockBadge}>●</Text>}
      </View>
    </TouchableOpacity>
  );
};

const DetailModal: React.FC<{
  photo: PhotoWithStatus | null;
  onClose: () => void;
  onDelete: (p: PhotoWithStatus) => void;
  onUpdated: () => Promise<void> | void;
}> = ({photo, onClose, onDelete, onUpdated}) => {
  const [decrypted, setDecrypted] = useState<Record<string, any> | null>(null);
  const [passOpen, setPassOpen] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // หลังจาก unlock เสร็จ ถ้าตั้ง flag นี้ไว้จะเปิด edit modal ต่อเลย
  const [openEditAfterUnlock, setOpenEditAfterUnlock] = useState(false);

  useEffect(() => {
    // reset เมื่อเปลี่ยนภาพ
    setDecrypted(null);
    setPassInput('');
    setPassOpen(false);
    setFullscreen(false);
    setEditOpen(false);
    setOpenEditAfterUnlock(false);
  }, [photo?.id]);

  if (!photo) return null;

  const hasCipher = !!(photo.cipher && photo.iv && photo.mac);

  const doDecrypt = async () => {
    if (!photo.cipher || !photo.iv || !photo.mac) return;
    setBusy(true);
    try {
      const json = await decryptString(photo.cipher, photo.iv, photo.mac);
      setDecrypted(JSON.parse(json));
      // ถ้าผู้ใช้กด Edit แล้วไปผ่าน unlock → เปิด edit modal ต่อเลย
      if (openEditAfterUnlock) {
        setOpenEditAfterUnlock(false);
        setEditOpen(true);
      }
    } catch (e: any) {
      Alert.alert('Decrypt failed', e.message);
      setOpenEditAfterUnlock(false);
    } finally {
      setBusy(false);
    }
  };

  const unlockAndDecrypt = async () => {
    if (sessionUnlocked) {
      await doDecrypt();
      return;
    }
    const hasPass = await hasViewerPassphrase();
    if (!hasPass) {
      Alert.alert(
        'No passphrase set',
        'You need to set a viewer passphrase first. Open it now?',
        [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Set', onPress: () => setPassOpen(true)},
        ],
      );
      return;
    }
    setPassOpen(true);
  };

  const submitPass = async () => {
    setBusy(true);
    try {
      const hasPass = await hasViewerPassphrase();
      if (!hasPass) {
        // first-time setup flow
        if (passInput.length < 6) {
          Alert.alert('Passphrase must be at least 6 characters');
          return;
        }
        await setViewerPassphrase(passInput);
        sessionUnlocked = true;
        setPassOpen(false);
        setPassInput('');
        await doDecrypt();
        return;
      }
      const ok = await verifyViewerPassphrase(passInput);
      if (!ok) {
        Alert.alert('Wrong passphrase');
        return;
      }
      sessionUnlocked = true;
      setPassOpen(false);
      setPassInput('');
      await doDecrypt();
    } finally {
      setBusy(false);
    }
  };

  const publicEntries = Object.entries(photo.publicData ?? {});
  const decryptedEntries = decrypted ? Object.entries(decrypted) : [];

  /**
   * เข้าโหมดแก้ไข:
   *  1) โหลด FormConfig ที่ผูกกับภาพนี้ (join JobPhotos → JobHistory → FormConfigs)
   *  2) hydrate initial values ต่อ field.id จากข้อมูลที่มี (public + decrypted)
   *     → ข้อมูลที่เก็บใน DB/EXIF ถูก key ด้วย field.label (ตามที่ processFormData ทำ)
   *       จึง map label → id ก่อน (ทำใน PhotoEditFormModal)
   *  3) ถ้าภาพมี encrypted data แต่ยังไม่ได้ unlock → ขอ passphrase ก่อนเปิด edit
   */
  const enterEdit = async () => {
    if (!photo) return;
    if (hasCipher && !decrypted) {
      // ต้อง unlock ก่อน เพื่อให้ PhotoEditFormModal มีค่า encrypted
      // ไว้ใช้ hydrate เข้าฟอร์ม
      setOpenEditAfterUnlock(true);
      await unlockAndDecrypt();
      return;
    }
    setEditOpen(true);
  };

  return (
    <Modal
      visible={!!photo}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={12} disabled={busy}>
            <Text style={styles.modalClose}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Photo detail</Text>
          <TouchableOpacity
            onPress={() => onDelete(photo)}
            hitSlop={12}
            disabled={busy}>
            <Text style={styles.modalDelete}>Delete</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{paddingBottom: 48}}>
          {photo.missing ? (
            <View style={[styles.fullImage, styles.fullImageMissing]}>
              <Text style={styles.missingText}>
                The image file is no longer on disk.
              </Text>
              <Text style={styles.missingHint}>
                Android/iOS may clear cached photos when storage is low.
                Metadata below is still intact.
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setFullscreen(true)}
              style={styles.fullImage}>
              {/* ใช้ resizeMode=cover ให้เต็มกรอบทั้งกว้างและสูง (crop ขอบได้)
                  แทน contain ที่ทิ้งพื้นที่ว่างตามสัดส่วนภาพ */}
              <Image
                source={{uri: photo.filePath}}
                style={styles.fullImageInner}
                resizeMode="cover"
              />
              <View style={styles.fullImageHint}>
                <Text style={styles.fullImageHintText}>tap to expand ⤢</Text>
              </View>
            </TouchableOpacity>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Meta</Text>
            <Row k="Captured" v={formatLocal(photo.capturedAt)} />
            <Row
              k="GPS"
              v={`${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}${
                photo.accuracy ? `  ±${Math.round(photo.accuracy)}m` : ''
              }`}
            />
            <Row k="Job" v={photo.jobId} />
          </View>

          {/* =============================================================
              แสดงข้อมูลที่บันทึกไว้ (Public + Encrypted cards)
              การแก้ไขย้ายไป PhotoEditFormModal (เปิดจากปุ่ม Edit metadata)
             ============================================================= */}
          {publicEntries.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Public</Text>
              {publicEntries.map(([k, v]) => (
                <Row key={k} k={k} v={formatFieldValue(v)} />
              ))}
            </View>
          )}

          {hasCipher && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Encrypted</Text>
              {decrypted ? (
                decryptedEntries.map(([k, v]) => (
                  <Row key={k} k={k} v={formatFieldValue(v)} />
                ))
              ) : (
                <TouchableOpacity
                  style={styles.unlockBtn}
                  onPress={unlockAndDecrypt}
                  disabled={busy}
                  activeOpacity={0.7}>
                  {busy ? (
                    <ActivityIndicator color={theme.accentText} />
                  ) : (
                    <Text style={styles.unlockBtnText}>
                      {sessionUnlocked
                        ? 'Decrypt sensitive fields'
                        : 'Unlock sensitive fields'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

          {!photo.missing && (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={enterEdit}
              disabled={busy}
              activeOpacity={0.7}>
              <Text style={styles.editBtnText}>Edit metadata</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Edit form — reuse DynamicFormRenderer เหมือนหน้า Default Form
            เปิดเป็น Modal ซ้อน เพื่อให้ UI ง่ายและตรงกันเป๊ะกับหน้าฟอร์มหลัก */}
        <PhotoEditFormModal
          visible={editOpen}
          photo={photo}
          decrypted={decrypted}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
            await onUpdated();
          }}
        />

        {/* Fullscreen image viewer — เปิดเมื่อกดภาพ preview */}
        <Modal
          visible={fullscreen && !photo.missing}
          animationType="fade"
          onRequestClose={() => setFullscreen(false)}
          statusBarTranslucent>
          <View style={styles.fsContainer}>
            <ZoomableImage
              uri={photo.filePath}
              containerStyle={styles.fsImage}
              resizeMode="contain"
            />
            <TouchableOpacity
              style={styles.fsClose}
              onPress={() => setFullscreen(false)}
              hitSlop={16}
              activeOpacity={0.7}>
              <Text style={styles.fsCloseText}>✕</Text>
            </TouchableOpacity>
            <View style={styles.fsHint} pointerEvents="none">
              <Text style={styles.fsHintText}>
                pinch to zoom · double-tap 2.5× · drag to pan
              </Text>
            </View>
          </View>
        </Modal>

        <Modal visible={passOpen} transparent animationType="fade">
          <View style={styles.passBackdrop}>
            <View style={styles.passCard}>
              <Text style={styles.passTitle}>Viewer passphrase</Text>
              <Text style={styles.passHint}>
                Stays unlocked for this session.
              </Text>
              <TextInput
                style={styles.passInput}
                secureTextEntry
                autoFocus
                placeholder="Passphrase"
                placeholderTextColor={theme.placeholder}
                value={passInput}
                onChangeText={setPassInput}
                onSubmitEditing={submitPass}
              />
              <View style={{flexDirection: 'row', gap: space.sm}}>
                <TouchableOpacity
                  style={[styles.passBtn, styles.passBtnGhost]}
                  onPress={() => {
                    setPassOpen(false);
                    setPassInput('');
                  }}
                  activeOpacity={0.7}>
                  <Text style={styles.passBtnGhostText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.passBtn}
                  onPress={submitPass}
                  disabled={busy}
                  activeOpacity={0.7}>
                  {busy ? (
                    <ActivityIndicator color={theme.accentText} />
                  ) : (
                    <Text style={styles.passBtnText}>Unlock</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
};

const Row: React.FC<{k: string; v: string}> = ({k, v}) => (
  <View style={styles.row}>
    <Text style={styles.rowKey}>{k}</Text>
    <Text style={styles.rowVal} selectable>
      {v}
    </Text>
  </View>
);

function formatLocal(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: theme.bg},
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.bg,
    padding: 32,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  emptyHint: {
    color: theme.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  tile: {
    // width มาจาก prop (ไดนามิกตาม columns) — ไม่ hardcode
    margin: space.xs,
  },
  thumb: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: theme.surfaceAlt,
    borderRadius: radius.sm,
  },
  thumbMissing: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: theme.border,
  },
  missingText: {
    color: theme.textMuted,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  missingHint: {
    color: theme.textDim,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },
  tileMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  tileTime: {
    color: theme.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    flex: 1,
  },
  lockBadge: {
    color: theme.encrypted,
    fontSize: 10,
    marginLeft: 4,
  },
  modal: {flex: 1, backgroundColor: theme.bg, paddingTop: 40},
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: 0.5,
    borderColor: theme.border,
  },
  modalClose: {color: theme.text, fontSize: 18, width: 48},
  modalTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  modalDelete: {
    color: theme.danger,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.5,
    textAlign: 'right',
    width: 60,
  },
  fullImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: theme.surfaceAlt,
    overflow: 'hidden',
  },
  // ภาพด้านในของ TouchableOpacity — ต้อง absolute เต็มกรอบของ parent
  // ไม่งั้น cover จะไม่รู้ขอบเขต (TouchableOpacity ไม่ force child ให้ fill)
  fullImageInner: {
    ...StyleSheet.absoluteFillObject,
  },
  fullImageHint: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.sm,
  },
  fullImageHintText: {
    color: theme.text,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  fullImageMissing: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
    aspectRatio: undefined,
    minHeight: 200,
  },
  card: {
    marginHorizontal: space.lg,
    marginTop: space.md,
    padding: space.md,
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: theme.border,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  row: {flexDirection: 'row', paddingVertical: 4},
  rowKey: {flex: 1, color: theme.textMuted, fontSize: 13},
  rowVal: {flex: 2, color: theme.text, fontSize: 13},
  unlockBtn: {
    backgroundColor: theme.accent,
    paddingVertical: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
    marginTop: 4,
  },
  unlockBtnText: {
    color: theme.accentText,
    fontWeight: '600',
    letterSpacing: 0.8,
    fontSize: 13,
  },
  passBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  passCard: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    padding: space.lg,
    borderWidth: 0.5,
    borderColor: theme.border,
  },
  passTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  passHint: {
    color: theme.textMuted,
    fontSize: 12,
    marginBottom: 14,
  },
  passInput: {
    backgroundColor: theme.surfaceAlt,
    color: theme.text,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 0.5,
    borderColor: theme.border,
    fontSize: 14,
    marginBottom: space.md,
  },
  passBtn: {
    flex: 1,
    backgroundColor: theme.accent,
    paddingVertical: 12,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  passBtnText: {
    color: theme.accentText,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  passBtnGhost: {
    backgroundColor: theme.surface,
    borderWidth: 0.5,
    borderColor: theme.border,
  },
  passBtnGhostText: {
    color: theme.text,
    fontWeight: '500',
    letterSpacing: 0.5,
  },

  // --- zoom bar ---
  zoomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: 0.5,
    borderColor: theme.border,
    gap: space.sm,
  },
  zoomBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  zoomBtnActive: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  zoomBtnText: {
    color: theme.textMuted,
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: '500',
  },
  zoomBtnTextActive: {
    color: theme.accentText,
    fontWeight: '600',
  },

  // --- tile-label picker (dropdown button on the left of zoomBar) ---
  colGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  labelPickerBtn: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    maxWidth: '55%',
  },
  labelPickerBtnText: {
    color: theme.textMuted,
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: '500',
    flexShrink: 1,
  },
  labelPickerCaret: {
    color: theme.textMuted,
    fontSize: 11,
    marginLeft: 6,
  },

  // --- picker overlay (the dropdown menu modal) ---
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
    marginLeft: space.sm,
  },

  // --- edit entry button (opens PhotoEditFormModal) ---
  editBtn: {
    marginHorizontal: space.lg,
    marginTop: space.md,
    paddingVertical: 12,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    alignItems: 'center',
  },
  editBtnText: {
    color: theme.text,
    fontWeight: '500',
    letterSpacing: 0.8,
    fontSize: 13,
  },

  // --- fullscreen viewer ---
  fsContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fsImage: {
    width: '100%',
    height: '100%',
  },
  fsClose: {
    position: 'absolute',
    top: 40,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fsCloseText: {
    color: theme.text,
    fontSize: 20,
    lineHeight: 22,
  },
  fsHint: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.sm,
  },
  fsHintText: {
    color: theme.textMuted,
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
