import RNFS from 'react-native-fs';
import Papa from 'papaparse';
import DocumentPicker from 'react-native-document-picker';
import {bulkInsertMasterData, clearMasterData} from '../database/masterData';

/**
 * ให้ user เลือกไฟล์ CSV จากเครื่อง แล้ว import ลงตาราง MasterData
 * Format CSV ที่รองรับ: คอลัมน์ label, value (หรือ header อื่นให้ระบุ mapping)
 */
export async function pickAndImportCsv(source: string): Promise<number> {
  const res = await DocumentPicker.pickSingle({
    type: [DocumentPicker.types.csv, DocumentPicker.types.plainText],
  });

  const content = await RNFS.readFile(res.uri, 'utf8');

  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim().toLowerCase(),
  });

  if (parsed.errors.length > 0) {
    throw new Error('CSV parse error: ' + parsed.errors[0].message);
  }

  const rows = parsed.data
    .map(r => {
      const label = r.label ?? r['ชื่อ'] ?? r.name ?? '';
      const value = r.value ?? r['รหัส'] ?? r.code ?? label;
      return {label, value};
    })
    .filter(r => r.label && r.value);

  // ล้าง source เก่าก่อน
  await clearMasterData(source);
  return await bulkInsertMasterData(source, rows);
}
