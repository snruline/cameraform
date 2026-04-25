import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  bulkInsertMasterData,
  clearMasterData,
  getMasterData,
} from '../database/masterData';
import {getDb} from '../database/db';
import {theme, radius, space} from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Optional — if set, opens directly in this source's detail view */
  initialSource?: string;
}

interface SourceSummary {
  source: string;
  count: number;
}

/**
 * Master Data Manager — CSV/XLSX import + per-source browse/clear.
 *
 * Formats supported:
 *   - .csv  (comma/semicolon-separated text)
 *   - .xlsx (Excel workbook; first sheet used)
 *   - .xls  (legacy Excel binary)
 *
 * Layout supported (same for all formats):
 *   1. Single column     →  "John Doe"           (label = value)
 *   2. Two columns       →  "John Doe","JD-001"  (label, value)
 *   3. Header row        →  first row recognized if it contains
 *                            'label' / 'value' — else treated as data.
 */
export const MasterDataManager: React.FC<Props> = ({
  visible,
  onClose,
  initialSource,
}) => {
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [activeSource, setActiveSource] = useState<string | null>(
    initialSource ?? null,
  );
  const [newSourceName, setNewSourceName] = useState(initialSource ?? '');
  const [csvUrl, setCsvUrl] = useState('');
  const [preview, setPreview] = useState<
    {label: string; value: string}[] | null
  >(null);
  const [busy, setBusy] = useState(false);
  // Persistent debug/error panel — stays visible until cleared.
  const [debugMsg, setDebugMsg] = useState<string>('');

  // Bump this when editing this file so you can confirm bundle reload.
  const BUILD_MARKER = 'v6-debug-panel';

  const loadSources = useCallback(async () => {
    const db = getDb();
    const res = await db.executeAsync(
      `SELECT source, COUNT(*) as count FROM MasterData GROUP BY source`,
    );
    const out: SourceSummary[] = [];
    for (let i = 0; i < (res.rows?.length ?? 0); i++) {
      const r = res.rows!.item(i);
      out.push({source: r.source, count: r.count});
    }
    setSources(out);
  }, []);

  useEffect(() => {
    if (visible) {
      loadSources();
      setActiveSource(initialSource ?? null);
      setNewSourceName(initialSource ?? '');
    } else {
      setPreview(null);
      setCsvUrl('');
    }
  }, [visible, initialSource, loadSources]);

  /**
   * Normalize raw 2D array of cells → {label, value}[].
   * Shared post-processing for both CSV and XLSX paths.
   */
  const normalizeRows = (rawRows: any[][]): boolean => {
    if (rawRows.length === 0) {
      Alert.alert('Empty file', 'No rows found.');
      return false;
    }

    const firstRow = rawRows[0].map(c =>
      String(c ?? '').toLowerCase().trim(),
    );
    const hasHeader =
      firstRow.includes('label') || firstRow.includes('value');
    const rows = hasHeader ? rawRows.slice(1) : rawRows;

    const normalized = rows
      .map(r => {
        const label = String(r[0] ?? '').trim();
        const value = String((r[1] ?? r[0]) ?? '').trim();
        return {label, value};
      })
      .filter(r => r.label.length > 0);

    if (normalized.length === 0) {
      Alert.alert('Empty file', 'No valid rows after parsing.');
      return false;
    }

    setPreview(normalized);
    return true;
  };

  /**
   * Parse CSV text → preview. Uses Papa for tolerant CSV handling.
   */
  const parseCsvText = (text: string): boolean => {
    const parsed = Papa.parse<string[]>(text.trim(), {
      skipEmptyLines: true,
    });
    if (parsed.errors.length > 0) {
      Alert.alert('Parse error', parsed.errors[0].message);
      return false;
    }
    return normalizeRows(parsed.data as string[][]);
  };

  /**
   * Convert base64 → Uint8Array, WITHOUT using globalThis.atob().
   *
   * Why: Hermes (RN's JS engine) implements atob() in a way that validates
   * UTF-8 on the returned binary string. Binary files (xlsx, images, etc.)
   * decode to non-UTF-8 byte sequences and cause Hermes to throw
   * "Invalid continuation byte" before we can even see the data.
   *
   * This implementation writes bytes straight into a Uint8Array — no
   * intermediate "binary string" → no JSI UTF-8 validation.
   */
  const B64_CHARS =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const B64_LOOKUP = (() => {
    const t = new Uint8Array(256);
    for (let i = 0; i < B64_CHARS.length; i++) {
      t[B64_CHARS.charCodeAt(i)] = i;
    }
    return t;
  })();

  const base64ToUint8Array = (b64: string): Uint8Array => {
    const cleaned = b64.replace(/[^A-Za-z0-9+/]/g, '');
    const len = cleaned.length;
    const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
    const outLen = Math.floor((len * 3) / 4) - padding;
    const out = new Uint8Array(outLen);

    let p = 0;
    for (let i = 0; i < len; i += 4) {
      const b0 = B64_LOOKUP[cleaned.charCodeAt(i)];
      const b1 = B64_LOOKUP[cleaned.charCodeAt(i + 1)];
      const b2 = B64_LOOKUP[cleaned.charCodeAt(i + 2)];
      const b3 = B64_LOOKUP[cleaned.charCodeAt(i + 3)];

      if (p < outLen) out[p++] = (b0 << 2) | (b1 >> 4);
      if (p < outLen) out[p++] = ((b1 & 0x0f) << 4) | (b2 >> 2);
      if (p < outLen) out[p++] = ((b2 & 0x03) << 6) | b3;
    }
    return out;
  };

  /**
   * Parse XLSX/XLS from base64 (RNFS) or ArrayBuffer (fetch) → preview.
   * Always feeds SheetJS a Uint8Array with type: 'array' — the only path
   * that reliably works on React Native Hermes (base64/binary paths hit
   * Buffer polyfill issues and throw "Invalid continuation byte").
   */
  const parseXlsxData = (
    data: string | ArrayBuffer,
    type: 'base64' | 'array',
  ): boolean => {
    try {
      const bytes =
        type === 'base64'
          ? base64ToUint8Array(data as string)
          : new Uint8Array(data as ArrayBuffer);

      const wb = XLSX.read(bytes, {type: 'array'});
      const firstSheetName = wb.SheetNames[0];
      if (!firstSheetName) {
        Alert.alert('Empty workbook', 'No sheets found in the file.');
        return false;
      }
      const ws = wb.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, {
        header: 1,
        blankrows: false,
        raw: false, // coerce numbers/dates to strings → avoid "42" vs 42 issues
        defval: '',
      });
      return normalizeRows(rawRows);
    } catch (e: any) {
      Alert.alert(
        'Parse error',
        `Could not read spreadsheet: ${e.message ?? String(e)}`,
      );
      return false;
    }
  };

  /**
   * Guess format from filename/URL. Defaults to CSV.
   */
  const isSpreadsheetFile = (nameOrUrl: string): boolean => {
    return /\.(xlsx|xls|xlsm|xlsb|ods)(\?|$)/i.test(nameOrUrl);
  };

  /**
   * Sniff format from raw file bytes.
   *  - XLSX / XLSM / ODS are ZIP archives → start with "PK\x03\x04"
   *  - Legacy XLS (OLE compound doc) → "D0 CF 11 E0 A1 B1 1A E1"
   */
  const sniffXlsxFromBytes = (bytes: Uint8Array): boolean => {
    if (bytes.length < 4) return false;
    // PK\x03\x04
    if (
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04
    ) {
      return true;
    }
    // OLE: D0 CF 11 E0
    if (
      bytes.length >= 8 &&
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0
    ) {
      return true;
    }
    return false;
  };

  /**
   * Decode CP874 / TIS-620 (Thai Windows ANSI) byte array → UTF-16 string.
   * TIS-620: 0x00-0x7F = ASCII; 0xA1-0xFB = U+0E01 + (byte - 0xA1).
   */
  const decodeCp874Bytes = (bytes: Uint8Array): string => {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b < 0x80) {
        out += String.fromCharCode(b);
      } else if (b === 0xa0) {
        out += '\u00A0';
      } else if (b >= 0xa1 && b <= 0xfb) {
        out += String.fromCharCode(0x0e00 + (b - 0xa0));
      } else {
        out += '\uFFFD';
      }
    }
    return out;
  };

  /**
   * Check if a byte array is valid UTF-8.
   */
  const isValidUtf8Bytes = (bytes: Uint8Array): boolean => {
    let i = 0;
    const len = bytes.length;
    while (i < len) {
      const b = bytes[i];
      if (b < 0x80) {
        i += 1;
      } else if ((b & 0xe0) === 0xc0) {
        if (i + 1 >= len || (bytes[i + 1] & 0xc0) !== 0x80) return false;
        i += 2;
      } else if ((b & 0xf0) === 0xe0) {
        if (
          i + 2 >= len ||
          (bytes[i + 1] & 0xc0) !== 0x80 ||
          (bytes[i + 2] & 0xc0) !== 0x80
        )
          return false;
        i += 3;
      } else if ((b & 0xf8) === 0xf0) {
        if (
          i + 3 >= len ||
          (bytes[i + 1] & 0xc0) !== 0x80 ||
          (bytes[i + 2] & 0xc0) !== 0x80 ||
          (bytes[i + 3] & 0xc0) !== 0x80
        )
          return false;
        i += 4;
      } else {
        return false;
      }
    }
    return true;
  };

  /**
   * Decode text from byte array with auto encoding detection.
   * Priority: UTF-8 BOM > UTF-16 LE BOM > UTF-16 BE BOM > valid UTF-8 > CP874.
   * Operates directly on Uint8Array — never touches atob or binary strings,
   * so it's immune to Hermes UTF-8 validation errors.
   */
  const decodeTextFromBytes = (bytes: Uint8Array): string => {
    // UTF-8 BOM: EF BB BF
    if (
      bytes.length >= 3 &&
      bytes[0] === 0xef &&
      bytes[1] === 0xbb &&
      bytes[2] === 0xbf
    ) {
      return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }

    // UTF-16 LE BOM: FF FE
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      let out = '';
      for (let i = 2; i + 1 < bytes.length; i += 2) {
        out += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
      }
      return out;
    }

    // UTF-16 BE BOM: FE FF
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      let out = '';
      for (let i = 2; i + 1 < bytes.length; i += 2) {
        out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
      }
      return out;
    }

    // No BOM — try strict UTF-8 validation
    if (isValidUtf8Bytes(bytes)) {
      return new TextDecoder('utf-8').decode(bytes);
    }

    // Fall back to CP874 / TIS-620 (Thai Windows ANSI, most Excel Thai CSVs)
    return decodeCp874Bytes(bytes);
  };

  const pickCsv = async () => {
    if (!newSourceName.trim()) {
      Alert.alert(
        'Source name required',
        'Enter a source name (e.g. "contacts") before importing.',
      );
      return;
    }
    let step = 'pickSingle';
    setDebugMsg(`[${BUILD_MARKER}] starting import…`);
    try {
      const res = await DocumentPicker.pickSingle({
        type: [
          DocumentPicker.types.csv,
          DocumentPicker.types.xlsx,
          DocumentPicker.types.xls,
          DocumentPicker.types.plainText,
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/*',
          '*/*',
        ],
        // Force Android to copy the file into our cache dir so we get a real
        // file:// path — avoids content:// URI issues from LINE/Drive/Gmail
        // where RNFS can't always read directly.
        copyTo: 'cachesDirectory',
      });
      setBusy(true);
      // Prefer the local copy when available (more reliable than content URIs).
      const rawUri = (res as any).fileCopyUri ?? res.uri;
      const path = rawUri.startsWith('file://')
        ? rawUri.replace('file://', '')
        : rawUri;
      const name = res.name ?? '';

      // Always read as base64 — RNFS returns it as pure ASCII which won't
      // trigger Hermes UTF-8 validation. We then decode the base64 into
      // Uint8Array with our own decoder (no atob → no JSI string issue).
      step = 'readFile-base64';
      const b64 = await RNFS.readFile(path, 'base64');

      step = 'base64ToUint8Array';
      const bytes = base64ToUint8Array(b64);

      step = 'sniff';
      const hintXlsx =
        isSpreadsheetFile(name) ||
        (res.type ?? '').includes('spreadsheet') ||
        (res.type ?? '').includes('excel');
      const actuallyXlsx = sniffXlsxFromBytes(bytes);
      const firstBytesHex = Array.from(bytes.slice(0, 8))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');

      const diag =
        `[${BUILD_MARKER}]\n` +
        `name: ${name}\n` +
        `type: ${res.type ?? '(none)'}\n` +
        `size: ${bytes.length} bytes\n` +
        `first 8 bytes: ${firstBytesHex}\n` +
        `sniff xlsx: ${actuallyXlsx}  /  hint xlsx: ${hintXlsx}`;
      setDebugMsg(diag);

      if (hintXlsx || actuallyXlsx) {
        step = 'parseXlsx';
        parseXlsxData(bytes.buffer as ArrayBuffer, 'array');
      } else {
        step = 'decodeText';
        const text = decodeTextFromBytes(bytes);
        step = 'parseCsv';
        parseCsvText(text);
      }
    } catch (e: any) {
      if (!DocumentPicker.isCancel(e)) {
        // Persistent panel + alert — user can read the full error later.
        const errMsg = e.message ?? String(e);
        setDebugMsg(
          `[${BUILD_MARKER}] FAILED at step "${step}"\n` +
            `error: ${errMsg}\n` +
            `stack: ${(e.stack ?? '').split('\n').slice(0, 3).join(' | ')}`,
        );
        Alert.alert(`Import failed (${step})`, errMsg);
      }
    } finally {
      setBusy(false);
    }
  };

  /**
   * Fetch CSV from a URL. Supports:
   *  - Direct CSV links (https://example.com/data.csv)
   *  - Google Sheets published as CSV (File → Share → Publish to web → CSV)
   *  - Google Drive public share links (auto-converted to direct download)
   *  - Any HTTP/HTTPS endpoint returning text/csv
   */
  const fetchCsvFromUrl = async () => {
    if (!newSourceName.trim()) {
      Alert.alert(
        'Source name required',
        'Enter a source name before fetching.',
      );
      return;
    }
    const url = csvUrl.trim();
    if (!url) {
      Alert.alert('URL required', 'Paste a CSV link first.');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      Alert.alert('Invalid URL', 'URL must start with http:// or https://');
      return;
    }

    setBusy(true);
    try {
      // Auto-convert Google Drive share links to direct download
      //   https://drive.google.com/file/d/<ID>/view?usp=sharing
      //   → https://drive.google.com/uc?export=download&id=<ID>
      let fetchUrl = url;
      const driveMatch = url.match(
        /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
      );
      if (driveMatch) {
        fetchUrl = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
      }

      const response = await fetch(fetchUrl, {
        headers: {
          Accept:
            'text/csv, text/plain, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*',
        },
      });
      if (!response.ok) {
        Alert.alert(
          'Fetch failed',
          `HTTP ${response.status} ${response.statusText || ''}`.trim(),
        );
        return;
      }

      // Always fetch as binary → sniff bytes → decide how to decode.
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0) {
        Alert.alert('Empty response', 'The URL returned no content.');
        return;
      }
      const bytes = new Uint8Array(buffer);

      const contentType = (
        response.headers.get('content-type') ?? ''
      ).toLowerCase();
      const hintXlsx =
        isSpreadsheetFile(url) ||
        contentType.includes('spreadsheet') ||
        contentType.includes('excel') ||
        contentType.includes('officedocument');
      const actuallyXlsx = sniffXlsxFromBytes(bytes);

      if (hintXlsx || actuallyXlsx) {
        parseXlsxData(buffer, 'array');
      } else {
        const text = decodeTextFromBytes(bytes);

        // Detect HTML error pages (e.g. Google Drive login wall)
        const looksLikeHtml =
          /^\s*<(!doctype|html)/i.test(text) ||
          text.toLowerCase().includes('<html');
        if (looksLikeHtml) {
          Alert.alert(
            'Not a CSV',
            'The URL returned an HTML page — check that the link is publicly accessible and points to a raw CSV or XLSX file.',
          );
          return;
        }

        parseCsvText(text);
      }
    } catch (e: any) {
      Alert.alert(
        'Fetch failed',
        e.message ?? 'Check your internet connection and the URL.',
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    if (!preview || !newSourceName.trim()) return;
    setBusy(true);
    try {
      const source = newSourceName.trim();
      const inserted = await bulkInsertMasterData(source, preview);
      Alert.alert('Imported', `${inserted} rows added to "${source}"`);
      setPreview(null);
      await loadSources();
      setActiveSource(source);
    } catch (e: any) {
      Alert.alert('Import failed', e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const doClear = (source: string) => {
    Alert.alert(
      'Clear source?',
      `Delete all rows in "${source}"? This cannot be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearMasterData(source);
            await loadSources();
            if (activeSource === source) setActiveSource(null);
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Master Data</Text>
            <Text style={styles.buildMarker}>build {BUILD_MARKER}</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </TouchableOpacity>
        </View>

        {debugMsg ? (
          <View style={styles.debugPanel}>
            <Text style={styles.debugText} selectable>
              {debugMsg}
            </Text>
            <TouchableOpacity
              onPress={() => setDebugMsg('')}
              style={styles.debugClose}
              hitSlop={8}>
              <Text style={styles.debugCloseText}>×</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <ScrollView
          style={{flex: 1}}
          contentContainerStyle={{padding: space.lg, paddingBottom: 48}}>
          <Text style={styles.sectionTitle}>Import CSV or Excel</Text>
          <Text style={styles.helpText}>
            Accepts .csv, .xlsx, and .xls files — use whichever format LINE /
            Gmail / Drive gives you. First column = label shown in
            autocomplete; second column (optional) = stored value. A
            "label,value" header row is detected automatically. For Excel
            files, only the first sheet is read.
          </Text>

          <Text style={styles.label}>Source name</Text>
          <TextInput
            style={styles.input}
            value={newSourceName}
            onChangeText={setNewSourceName}
            placeholder="e.g. contacts, cases, products"
            placeholderTextColor={theme.placeholder}
            autoCapitalize="none"
          />

          <Text style={[styles.label, {marginTop: 16}]}>
            Option 1 — Pick from phone
          </Text>
          <Text style={styles.hintText}>
            Opens Android's file picker. Works with LINE chats, Gmail
            attachments, Google Drive, Downloads folder, and any cloud app
            installed on this phone.
          </Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={pickCsv}
            activeOpacity={0.7}
            disabled={busy}>
            {busy ? (
              <ActivityIndicator color={theme.accentText} />
            ) : (
              <Text style={styles.btnText}>Pick CSV or Excel file</Text>
            )}
          </TouchableOpacity>

          <Text style={[styles.label, {marginTop: 20}]}>
            Option 2 — Fetch from URL
          </Text>
          <Text style={styles.hintText}>
            Paste a direct link to a .csv or .xlsx file, a public Google
            Drive share link, or a Google Sheets "publish to web → CSV" URL.
          </Text>
          <TextInput
            style={styles.input}
            value={csvUrl}
            onChangeText={setCsvUrl}
            placeholder="https://example.com/masterdata.xlsx"
            placeholderTextColor={theme.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <TouchableOpacity
            style={[styles.btn, styles.btnGhost]}
            onPress={fetchCsvFromUrl}
            activeOpacity={0.7}
            disabled={busy}>
            {busy ? (
              <ActivityIndicator color={theme.text} />
            ) : (
              <Text style={styles.btnGhostText}>Fetch from URL</Text>
            )}
          </TouchableOpacity>

          {preview && (
            <View style={styles.previewBox}>
              <Text style={styles.previewTitle}>
                Preview — {preview.length} rows
              </Text>
              {preview.slice(0, 10).map((r, i) => (
                <View key={i} style={styles.previewRow}>
                  <Text style={styles.previewLabel}>{r.label}</Text>
                  {r.value !== r.label && (
                    <Text style={styles.previewValue}>{r.value}</Text>
                  )}
                </View>
              ))}
              {preview.length > 10 && (
                <Text style={styles.previewMore}>
                  … and {preview.length - 10} more
                </Text>
              )}
              <View style={{flexDirection: 'row', marginTop: 12}}>
                <TouchableOpacity
                  style={[styles.btn, {flex: 1, marginRight: 8}]}
                  onPress={confirmImport}
                  activeOpacity={0.7}>
                  <Text style={styles.btnText}>Confirm import</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnGhost, {flex: 1}]}
                  onPress={() => setPreview(null)}
                  activeOpacity={0.7}>
                  <Text style={styles.btnGhostText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Text style={[styles.sectionTitle, {marginTop: 32}]}>
            Existing sources
          </Text>
          {sources.length === 0 ? (
            <Text style={styles.helpText}>No master data imported yet.</Text>
          ) : (
            sources.map(s => (
              <SourceCard
                key={s.source}
                summary={s}
                expanded={activeSource === s.source}
                onToggle={() =>
                  setActiveSource(activeSource === s.source ? null : s.source)
                }
                onClear={() => doClear(s.source)}
              />
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const SourceCard: React.FC<{
  summary: SourceSummary;
  expanded: boolean;
  onToggle: () => void;
  onClear: () => void;
}> = ({summary, expanded, onToggle, onClear}) => {
  const [rows, setRows] = useState<{label: string; value: string}[]>([]);

  useEffect(() => {
    if (expanded) {
      getMasterData(summary.source, '', 50).then(setRows);
    }
  }, [expanded, summary.source]);

  return (
    <View style={styles.sourceCard}>
      <TouchableOpacity
        style={styles.sourceHeader}
        onPress={onToggle}
        activeOpacity={0.7}>
        <View>
          <Text style={styles.sourceName}>{summary.source}</Text>
          <Text style={styles.sourceCount}>{summary.count} rows</Text>
        </View>
        <Text style={styles.sourceChevron}>{expanded ? '−' : '+'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.sourceBody}>
          {rows.slice(0, 20).map((r, i) => (
            <View key={i} style={styles.sourceRow}>
              <Text style={styles.sourceRowLabel}>{r.label}</Text>
              {r.value !== r.label && (
                <Text style={styles.sourceRowValue}>{r.value}</Text>
              )}
            </View>
          ))}
          {summary.count > 20 && (
            <Text style={styles.previewMore}>
              … showing 20 of {summary.count}
            </Text>
          )}
          <TouchableOpacity
            style={[styles.btn, styles.btnDanger, {marginTop: 12}]}
            onPress={onClear}
            activeOpacity={0.7}>
            <Text style={styles.btnDangerText}>Clear source</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: theme.bg, paddingTop: 48},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderColor: theme.border,
  },
  headerTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  close: {color: theme.text, fontSize: 14, letterSpacing: 0.5},
  buildMarker: {
    color: theme.textDim,
    fontSize: 9,
    marginTop: 2,
    letterSpacing: 0.5,
    fontFamily: 'monospace',
  },
  debugPanel: {
    backgroundColor: '#2a1a1a',
    borderWidth: 1,
    borderColor: '#7a3a3a',
    margin: 12,
    padding: 12,
    borderRadius: 6,
    position: 'relative',
  },
  debugText: {
    color: '#ffcccc',
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 16,
    paddingRight: 20,
  },
  debugClose: {
    position: 'absolute',
    top: 4,
    right: 8,
  },
  debugCloseText: {color: '#ffaaaa', fontSize: 18, fontWeight: '600'},
  sectionTitle: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  helpText: {
    color: theme.textDim,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  hintText: {
    color: theme.textDim,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 8,
  },
  label: {
    color: theme.textMuted,
    fontSize: 11,
    marginTop: 8,
    marginBottom: 4,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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
  btn: {
    backgroundColor: theme.accent,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: space.sm,
  },
  btnText: {
    color: theme.accentText,
    fontWeight: '600',
    fontSize: 14,
    letterSpacing: 0.6,
  },
  btnGhost: {
    backgroundColor: theme.surface,
    borderWidth: 0.5,
    borderColor: theme.border,
  },
  btnGhostText: {color: theme.text, fontWeight: '500', letterSpacing: 0.5},
  btnDanger: {
    backgroundColor: theme.surface,
    borderWidth: 0.5,
    borderColor: theme.danger,
  },
  btnDangerText: {color: theme.danger, fontWeight: '500', letterSpacing: 0.5},
  previewBox: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    padding: 12,
    marginTop: space.md,
    borderWidth: 0.5,
    borderColor: theme.border,
  },
  previewTitle: {
    color: theme.textMuted,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderColor: theme.border,
  },
  previewLabel: {color: theme.text, fontSize: 13, flex: 1},
  previewValue: {color: theme.textMuted, fontSize: 12, marginLeft: 12},
  previewMore: {
    color: theme.textDim,
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 6,
  },
  sourceCard: {
    backgroundColor: theme.surface,
    borderRadius: radius.md,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  sourceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  sourceName: {color: theme.text, fontSize: 14, fontWeight: '500'},
  sourceCount: {
    color: theme.textDim,
    fontSize: 11,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  sourceChevron: {color: theme.textMuted, fontSize: 22, fontWeight: '300'},
  sourceBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 0.5,
    borderColor: theme.border,
  },
  sourceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderColor: theme.border,
  },
  sourceRowLabel: {color: theme.text, fontSize: 13, flex: 1},
  sourceRowValue: {color: theme.textMuted, fontSize: 12, marginLeft: 12},
});
