import React, {useState, useEffect, useMemo, useRef, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  Image,
  Linking,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {WebView, WebViewMessageEvent} from 'react-native-webview';
import {useFocusEffect} from '@react-navigation/native';
import DocumentPicker from 'react-native-document-picker';
import {useLocation} from '../hooks/useLocation';
import {JobPhotoRow, listJobPhotos} from '../database/jobHistory';
import {
  UploadedPhotoRow,
  listUploadedPhotos,
  addUploadedPhoto,
  deleteUploadedPhoto,
  clearAllUploadedPhotos,
} from '../database/uploadedPhotos';
import {readExifGps} from '../security/exif';
import {generateId} from '../utils/id';
import {LEAFLET_HTML} from './mapHtml';
import {theme, radius, space} from '../theme';

/**
 * Main #2 — Map Screen
 *
 * 2 head tabs:
 *   Gallery        → รูปที่ถ่ายผ่านแอป (JobPhotos) pin ตาม lat/lng ที่บันทึกไว้
 *   Upload Images  → รูปที่ผู้ใช้อัพโหลดจากเครื่อง (ต้องมี EXIF GPS)
 *                    pin ตาม GPS ของรูปเอง — แยกจาก Gallery ชัดเจน
 *
 * ไม่มีโหมด Targets แล้ว (CSV import targets ถูกตัดออกจากหน้า Map)
 *
 * การสื่อสารกับ WebView ใช้ LEAFLET_HTML (setMarkers, setCenter,
 * setUserLocation) — WebView instance เดียว แต่ markers จะเปลี่ยนตาม tab
 */
type Tab = 'gallery' | 'upload';

type Selection =
  | {kind: 'gallery'; id: string}
  | {kind: 'uploaded'; id: string}
  | null;

interface MarkerPayload {
  id: string;
  lat: number;
  lng: number;
  title: string;
  description: string;
}

/**
 * LocateIcon — crosshair/target icon (คล้ายปุ่ม "my location" ของ Google Maps)
 * วาดจาก plain Views ล้วน ๆ (วงกลมนอก + จุดกลาง + tick 4 ทิศ)
 * เพื่อไม่ต้องพึ่ง icon library (โปรเจกต์ยังไม่มี vector-icons / svg)
 */
const LocateIcon: React.FC<{size?: number; color?: string}> = ({
  size = 22,
  color = theme.text,
}) => {
  const ringSize = Math.round(size * 0.62);
  const dotSize = Math.round(size * 0.18);
  const tickLen = Math.round(size * 0.16);
  const tickThick = 1.6;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <View
        style={{
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth: 1.6,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: color,
          }}
        />
      </View>
      <View
        style={{
          position: 'absolute',
          top: 0,
          width: tickThick,
          height: tickLen,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          width: tickThick,
          height: tickLen,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          width: tickLen,
          height: tickThick,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: 0,
          width: tickLen,
          height: tickThick,
          backgroundColor: color,
        }}
      />
    </View>
  );
};

export const MapScreen: React.FC = () => {
  const {location} = useLocation(true);

  const [tab, setTab] = useState<Tab>('gallery');

  const [galleryPhotos, setGalleryPhotos] = useState<JobPhotoRow[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhotoRow[]>([]);

  const [selected, setSelected] = useState<Selection>(null);
  const [listOpen, setListOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [uploading, setUploading] = useState(false);

  const webRef = useRef<WebView>(null);

  // -----------------------------------------------------------------
  // data loaders
  // -----------------------------------------------------------------
  const loadGallery = useCallback(async () => {
    try {
      const rows = await listJobPhotos(500);
      setGalleryPhotos(rows);
    } catch {
      setGalleryPhotos([]);
    }
  }, []);

  const loadUploaded = useCallback(async () => {
    try {
      const rows = await listUploadedPhotos(500);
      setUploadedPhotos(rows);
    } catch {
      setUploadedPhotos([]);
    }
  }, []);

  // โหลดใหม่ทุกครั้งที่กลับมาหน้านี้ — Gallery อาจมีรูปใหม่
  useFocusEffect(
    useCallback(() => {
      loadGallery();
      loadUploaded();
    }, [loadGallery, loadUploaded]),
  );

  // -----------------------------------------------------------------
  // WebView bridge
  // -----------------------------------------------------------------
  const inject = useCallback((code: string) => {
    webRef.current?.injectJavaScript(code + '; true;');
  }, []);

  // คำนวณ markers จาก tab ปัจจุบัน — ใช้ prefix 'gallery:/uploaded:'
  // เพื่อให้ตอน click กลับมารู้ว่า pin มาจากแหล่งไหน
  const markers = useMemo<MarkerPayload[]>(() => {
    if (tab === 'gallery') {
      return galleryPhotos.map(p => ({
        id: `gallery:${p.id}`,
        lat: p.latitude,
        lng: p.longitude,
        title: formatLocal(p.capturedAt),
        description: summarizePublic(p.publicData),
      }));
    }
    // Upload Images tab
    return uploadedPhotos.map(p => ({
      id: `uploaded:${p.id}`,
      lat: p.latitude,
      lng: p.longitude,
      title: p.originalName ?? 'Uploaded photo',
      description: p.capturedAt ? formatLocal(p.capturedAt) : '',
    }));
  }, [tab, galleryPhotos, uploadedPhotos]);

  useEffect(() => {
    if (!mapReady) return;
    inject(`window.CF.setMarkers(${JSON.stringify(markers)})`);
  }, [markers, mapReady, inject]);

  useEffect(() => {
    if (!mapReady || !location) return;
    inject(
      `window.CF.setUserLocation(${location.latitude}, ${
        location.longitude
      }, ${location.accuracy ?? 0})`,
    );
  }, [location, mapReady, inject]);

  // center ครั้งแรกที่ได้พิกัด user
  const centeredOnceRef = useRef(false);
  useEffect(() => {
    if (!mapReady || !location || centeredOnceRef.current) return;
    centeredOnceRef.current = true;
    inject(
      `window.CF.setCenter(${location.latitude}, ${location.longitude}, 15)`,
    );
  }, [location, mapReady, inject]);

  // เปลี่ยน tab → ยกเลิกการเลือก (pin id คนละแหล่งอยู่แล้ว)
  useEffect(() => {
    setSelected(null);
    setListOpen(false);
  }, [tab]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'ready') {
        setMapReady(true);
      } else if (msg.type === 'markerClick') {
        const idStr = String(msg.id);
        const sep = idStr.indexOf(':');
        if (sep === -1) return;
        const kind = idStr.slice(0, sep);
        const id = idStr.slice(sep + 1);
        if (kind === 'gallery' || kind === 'uploaded') {
          setSelected({kind, id});
        }
      }
    } catch {
      /* ignore */
    }
  };

  // -----------------------------------------------------------------
  // actions
  // -----------------------------------------------------------------
  const locateMe = () => {
    if (!location) {
      Alert.alert('No location', 'Waiting for GPS…');
      return;
    }
    inject(
      `window.CF.setCenter(${location.latitude}, ${location.longitude}, 16)`,
    );
  };

  const openNavigation = (lat: number, lng: number, label: string) => {
    const l = encodeURIComponent(label);
    const url =
      Platform.OS === 'ios'
        ? `maps://?daddr=${lat},${lng}&q=${l}`
        : `geo:${lat},${lng}?q=${lat},${lng}(${l})`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(
        `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`,
      );
    });
  };

  /**
   * อัพโหลดรูปจากเครื่อง — อ่าน EXIF GPS → บันทึกลง UploadedPhotos → pin
   * รองรับหลายไฟล์พร้อมกัน ข้ามรูปที่ไม่มี GPS และรายงานยอดรวม
   */
  const pickAndUpload = async () => {
    setUploading(true);
    try {
      const results = await DocumentPicker.pick({
        type: [DocumentPicker.types.images],
        // copyTo: เก็บไฟล์ลง documentDirectory เพื่อให้ยังเปิดได้หลังรีสตาร์ท
        // แม้ต้นฉบับ (camera roll / content URI) จะหายไป
        copyTo: 'documentDirectory',
        allowMultiSelection: true,
      });
      let ok = 0;
      let skipped = 0;
      const skippedNames: string[] = [];
      for (const r of results) {
        const uri: string | null =
          ((r as any).fileCopyUri as string | null) ?? r.uri;
        if (!uri) {
          skipped++;
          continue;
        }
        const path = uri.startsWith('file://')
          ? uri.replace('file://', '')
          : uri;
        const gps = await readExifGps(path);
        if (!gps) {
          skipped++;
          if (r.name) skippedNames.push(r.name);
          continue;
        }
        await addUploadedPhoto({
          id: generateId(),
          filePath: uri.startsWith('file://') ? uri : 'file://' + uri,
          latitude: gps.latitude,
          longitude: gps.longitude,
          capturedAt: gps.capturedAt,
          uploadedAt: new Date().toISOString(),
          originalName: r.name ?? undefined,
        });
        ok++;
      }
      await loadUploaded();
      if (ok === 0 && skipped > 0) {
        Alert.alert(
          'No GPS found',
          'None of the selected images have GPS coordinates in EXIF. Only photos taken with location services on can be pinned.',
        );
      } else if (skipped > 0) {
        Alert.alert(
          'Uploaded',
          `${ok} added · ${skipped} skipped (no GPS)` +
            (skippedNames.length
              ? '\n\nSkipped:\n' + skippedNames.slice(0, 5).join('\n')
              : ''),
        );
      }
      if (ok > 0) setTab('upload');
    } catch (e: any) {
      if (!DocumentPicker.isCancel(e)) {
        Alert.alert('Upload failed', e?.message ?? String(e));
      }
    } finally {
      setUploading(false);
    }
  };

  const removeUploaded = (photo: UploadedPhotoRow) => {
    Alert.alert(
      'Remove pin?',
      'This removes the pinned image from the map. The original file on your device is not deleted.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteUploadedPhoto(photo.id);
            setSelected(null);
            await loadUploaded();
          },
        },
      ],
    );
  };

  /** ลบทีละรายการจาก list — รับแค่ id (ไม่ต้องโหลด full row) */
  const removeUploadedById = (id: string) => {
    Alert.alert('Remove pin?', 'Remove this uploaded image from the map?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteUploadedPhoto(id);
          if (selected?.kind === 'uploaded' && selected.id === id) {
            setSelected(null);
          }
          await loadUploaded();
        },
      },
    ]);
  };

  /** ลบทั้งหมด — ใช้กับ "Clear all" ใน list header */
  const clearAllUploaded = () => {
    if (uploadedPhotos.length === 0) return;
    Alert.alert(
      'Clear all uploaded?',
      `Remove all ${uploadedPhotos.length} uploaded image pins from the map? Original files on your device won't be deleted.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
            await clearAllUploadedPhotos();
            if (selected?.kind === 'uploaded') setSelected(null);
            await loadUploaded();
          },
        },
      ],
    );
  };

  // -----------------------------------------------------------------
  // derived UI state
  // -----------------------------------------------------------------
  const currentList: Array<ListRowModel> = useMemo(() => {
    if (tab === 'gallery') {
      return galleryPhotos.map(p => ({
        id: p.id,
        kind: 'gallery' as const,
        title: formatLocal(p.capturedAt),
        subtitle: summarizePublic(p.publicData) || '—',
        meta: `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`,
        filePath: p.filePath,
      }));
    }
    return uploadedPhotos.map(p => ({
      id: p.id,
      kind: 'uploaded' as const,
      title: p.originalName ?? 'Uploaded photo',
      subtitle: p.capturedAt ? formatLocal(p.capturedAt) : 'No capture time',
      meta: `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`,
      filePath: p.filePath,
    }));
  }, [tab, galleryPhotos, uploadedPhotos]);

  const currentCount =
    tab === 'gallery' ? galleryPhotos.length : uploadedPhotos.length;

  const source = useMemo(() => ({html: LEAFLET_HTML}), []);

  // -----------------------------------------------------------------
  // render
  // -----------------------------------------------------------------
  return (
    <View style={styles.container}>
      {/* ================== Top tab bar: Gallery / Upload Images ================== */}
      <View style={styles.tabBar}>
        <TabButton
          label={`Gallery  ${galleryPhotos.length}`}
          active={tab === 'gallery'}
          onPress={() => setTab('gallery')}
        />
        <TabButton
          label={`Upload Images  ${uploadedPhotos.length}`}
          active={tab === 'upload'}
          onPress={() => setTab('upload')}
        />
      </View>

      {/* ================== Map ================== */}
      <View style={styles.mapWrap}>
        <WebView
          ref={webRef}
          source={source}
          onMessage={onMessage}
          style={StyleSheet.absoluteFill}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          mixedContentMode="always"
          setSupportMultipleWindows={false}
        />

        {/* Locate FAB — crosshair icon (คล้าย Google Maps) */}
        <TouchableOpacity
          style={[styles.fab, styles.fabSecondary]}
          onPress={locateMe}
          hitSlop={8}
          accessibilityLabel="Locate me"
          accessibilityRole="button"
          activeOpacity={0.7}>
          <LocateIcon size={22} color={theme.text} />
        </TouchableOpacity>

        {/* Primary FAB — Upload on Upload tab, List on Gallery tab */}
        {tab === 'upload' ? (
          <TouchableOpacity
            style={styles.fab}
            onPress={pickAndUpload}
            disabled={uploading}
            activeOpacity={0.7}>
            {uploading ? (
              <ActivityIndicator color={theme.accentText} />
            ) : (
              <Text style={styles.fabText}>
                Upload  {uploadedPhotos.length}
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.fab}
            onPress={() => setListOpen(true)}
            activeOpacity={0.7}>
            <Text style={styles.fabText}>List  {currentCount}</Text>
          </TouchableOpacity>
        )}

        {/* Secondary list FAB on Upload tab — อยู่เหนือปุ่ม Upload */}
        {tab === 'upload' && uploadedPhotos.length > 0 && (
          <TouchableOpacity
            style={[styles.fab, styles.fabTertiary]}
            onPress={() => setListOpen(true)}
            activeOpacity={0.7}>
            <Text style={styles.fabSecondaryText}>List</Text>
          </TouchableOpacity>
        )}

        {/* Bottom sheet for currently selected pin */}
        {selected && (
          <SelectedSheet
            selected={selected}
            galleryPhotos={galleryPhotos}
            uploadedPhotos={uploadedPhotos}
            onClose={() => setSelected(null)}
            onNavigate={openNavigation}
            onRemoveUploaded={removeUploaded}
          />
        )}
      </View>

      {/* ================== List modal ================== */}
      <Modal
        visible={listOpen}
        animationType="slide"
        onRequestClose={() => setListOpen(false)}>
        <View style={styles.listContainer}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>
              {tab === 'upload' ? 'Uploaded' : 'Gallery'}
              <Text style={styles.listCount}>  {currentCount}</Text>
            </Text>
            <View style={styles.listHeaderActions}>
              {/* "Clear all" — เฉพาะ tab Upload Images และเมื่อมีรายการ */}
              {tab === 'upload' && uploadedPhotos.length > 0 && (
                <TouchableOpacity
                  onPress={clearAllUploaded}
                  hitSlop={8}
                  style={styles.listHeaderClearBtn}>
                  <Text style={styles.listHeaderClearText}>Clear all</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setListOpen(false)} hitSlop={12}>
                <Text style={styles.listClose}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
          <FlatList
            data={currentList}
            keyExtractor={item => `${item.kind}:${item.id}`}
            renderItem={({item}) => (
              <View style={styles.listItem}>
                <TouchableOpacity
                  style={styles.listItemMain}
                  onPress={() => {
                    setSelected({kind: item.kind, id: item.id});
                    setListOpen(false);
                    // หาพิกัดเพื่อ center map ไปยัง pin นี้
                    const m = markers.find(
                      mk => mk.id === `${item.kind}:${item.id}`,
                    );
                    if (m && mapReady) {
                      inject(`window.CF.setCenter(${m.lat}, ${m.lng}, 16)`);
                    }
                  }}>
                  {item.filePath && (
                    <Image
                      source={{uri: item.filePath}}
                      style={styles.listThumb}
                    />
                  )}
                  <View style={{flex: 1}}>
                    <Text style={styles.listItemTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {!!item.subtitle && (
                      <Text style={styles.listItemSub} numberOfLines={2}>
                        {item.subtitle}
                      </Text>
                    )}
                    <Text style={styles.listItemMeta}>{item.meta}</Text>
                  </View>
                </TouchableOpacity>
                {/* ปุ่ม X ลบรายการ — เฉพาะ tab Upload */}
                {item.kind === 'uploaded' && (
                  <TouchableOpacity
                    onPress={() => removeUploadedById(item.id)}
                    hitSlop={10}
                    style={styles.listItemRemove}
                    accessibilityLabel="Remove this uploaded image">
                    <Text style={styles.listItemRemoveText}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            ListEmptyComponent={
              <View style={{padding: 24, alignItems: 'center'}}>
                <Text style={{color: theme.textMuted}}>
                  {tab === 'upload'
                    ? 'No uploaded images yet'
                    : 'No photos in gallery yet'}
                </Text>
                <Text
                  style={{
                    color: theme.textDim,
                    marginTop: 4,
                    fontSize: 12,
                    textAlign: 'center',
                  }}>
                  {tab === 'upload'
                    ? 'Tap Upload to add images with GPS EXIF data'
                    : 'Take photos in the Camera tab'}
                </Text>
              </View>
            }
          />
        </View>
      </Modal>
    </View>
  );
};

// =====================================================================
// small components
// =====================================================================
const TabButton: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({label, active, onPress}) => (
  <TouchableOpacity
    onPress={onPress}
    style={[styles.tabBtn, active && styles.tabBtnActive]}
    activeOpacity={0.7}>
    <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>
      {label}
    </Text>
  </TouchableOpacity>
);

interface ListRowModel {
  id: string;
  kind: 'gallery' | 'uploaded';
  title: string;
  subtitle: string;
  meta: string;
  filePath?: string;
}

const SelectedSheet: React.FC<{
  selected: NonNullable<Selection>;
  galleryPhotos: JobPhotoRow[];
  uploadedPhotos: UploadedPhotoRow[];
  onClose: () => void;
  onNavigate: (lat: number, lng: number, label: string) => void;
  onRemoveUploaded: (photo: UploadedPhotoRow) => void;
}> = ({
  selected,
  galleryPhotos,
  uploadedPhotos,
  onClose,
  onNavigate,
  onRemoveUploaded,
}) => {
  if (selected.kind === 'gallery') {
    const p = galleryPhotos.find(x => x.id === selected.id);
    if (!p) return null;
    const label = formatLocal(p.capturedAt);
    return (
      <View style={styles.bottomSheet}>
        <View style={styles.sheetRow}>
          <Image source={{uri: p.filePath}} style={styles.sheetThumb} />
          <View style={{flex: 1, marginLeft: 10}}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {label}
            </Text>
            <Text style={styles.sheetLine} numberOfLines={2}>
              {summarizePublic(p.publicData) || '—'}
            </Text>
            <Text style={styles.sheetMeta}>
              {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
            </Text>
          </View>
        </View>
        <View style={styles.sheetActions}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => onNavigate(p.latitude, p.longitude, label)}>
            <Text style={styles.btnPrimaryText}>Navigate</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnGhost]}
            onPress={onClose}>
            <Text style={styles.btnGhostText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // uploaded
  const p = uploadedPhotos.find(x => x.id === selected.id);
  if (!p) return null;
  const label = p.originalName ?? 'Uploaded photo';
  return (
    <View style={styles.bottomSheet}>
      <View style={styles.sheetRow}>
        <Image source={{uri: p.filePath}} style={styles.sheetThumb} />
        <View style={{flex: 1, marginLeft: 10}}>
          <Text style={styles.sheetTitle} numberOfLines={1}>
            {label}
          </Text>
          {p.capturedAt && (
            <Text style={styles.sheetLine} numberOfLines={1}>
              Taken: {formatLocal(p.capturedAt)}
            </Text>
          )}
          <Text style={styles.sheetMeta}>
            {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
          </Text>
        </View>
      </View>
      <View style={styles.sheetActions}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          onPress={() => onNavigate(p.latitude, p.longitude, label)}>
          <Text style={styles.btnPrimaryText}>Navigate</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnGhost]}
          onPress={() => onRemoveUploaded(p)}>
          <Text style={styles.btnGhostText}>Remove</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnGhost]}
          onPress={onClose}>
          <Text style={styles.btnGhostText}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// =====================================================================
// helpers
// =====================================================================
function formatLocal(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** สรุป publicData เป็น "k: v · k2: v2" (ตัดเหลือ 60 ตัว) */
function summarizePublic(data: Record<string, any> | null | undefined): string {
  if (!data) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined || v === '') continue;
    let s: string;
    if (typeof v === 'object' && 'label' in v && v.label != null) {
      s = String(v.label);
    } else {
      s = String(v);
    }
    parts.push(`${k}: ${s}`);
    if (parts.join(' · ').length > 60) break;
  }
  const joined = parts.join(' · ');
  return joined.length > 60 ? joined.slice(0, 57) + '…' : joined;
}

// =====================================================================
// styles
// =====================================================================
const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: theme.bg},
  mapWrap: {flex: 1},

  // --- top tab bar ---
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.bg,
    borderBottomWidth: 0.5,
    borderColor: theme.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: theme.accent,
  },
  tabBtnText: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tabBtnTextActive: {
    color: theme.text,
    fontWeight: '600',
  },

  // --- FABs ---
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: theme.accent,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.xl,
    elevation: 4,
    minWidth: 110,
    alignItems: 'center',
  },
  // Locate button — round icon button (แบบ Google Maps)
  fabSecondary: {
    right: 16,
    bottom: 84,
    width: 44,
    height: 44,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 22,
    backgroundColor: theme.surface,
    borderWidth: 0.5,
    borderColor: theme.borderStrong,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabTertiary: {
    right: 16,
    bottom: 144,
    backgroundColor: theme.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 0.5,
    borderColor: theme.borderStrong,
    minWidth: 0,
  },
  fabText: {
    color: theme.accentText,
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 1,
  },
  fabSecondaryText: {
    color: theme.text,
    fontWeight: '500',
    fontSize: 12,
    letterSpacing: 1,
  },

  // --- bottom sheet ---
  bottomSheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 90,
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 0.5,
    borderColor: theme.border,
    elevation: 6,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetThumb: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
    backgroundColor: theme.surfaceAlt,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  sheetLine: {
    fontSize: 12,
    color: theme.textMuted,
    marginVertical: 1,
  },
  sheetMeta: {
    fontSize: 11,
    color: theme.textDim,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  sheetActions: {
    flexDirection: 'row',
    marginTop: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
  },
  btnPrimary: {backgroundColor: theme.accent},
  btnPrimaryText: {
    color: theme.accentText,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  btnGhost: {
    backgroundColor: theme.surfaceAlt,
    borderWidth: 0.5,
    borderColor: theme.border,
  },
  btnGhostText: {color: theme.text, letterSpacing: 0.5},

  // --- list modal ---
  listContainer: {flex: 1, paddingTop: 50, backgroundColor: theme.bg},
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderColor: theme.border,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  listCount: {color: theme.textMuted, fontWeight: '400'},
  listClose: {color: theme.text, fontSize: 14, letterSpacing: 0.5},
  // กลุ่มปุ่มขวา (Clear all + Close)
  listHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  listHeaderClearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 0.5,
    borderColor: theme.danger,
    borderRadius: radius.sm,
  },
  listHeaderClearText: {
    color: theme.danger,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  // แต่ละแถว — เป็น row container ที่มีทั้งส่วนแตะกลาง + ปุ่ม X
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderColor: theme.border,
  },
  listItemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  listItemRemove: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  listItemRemoveText: {
    color: theme.danger,
    fontSize: 24,
    fontWeight: '300',
    lineHeight: 24,
  },
  listThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: theme.surfaceAlt,
    marginRight: 12,
  },
  listItemTitle: {fontSize: 14, fontWeight: '500', color: theme.text},
  listItemSub: {color: theme.textMuted, marginTop: 2, fontSize: 13},
  listItemMeta: {
    color: theme.textDim,
    marginTop: 4,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
