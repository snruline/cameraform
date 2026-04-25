import RNFS from 'react-native-fs';
import Papa from 'papaparse';
import DocumentPicker from 'react-native-document-picker';
import {JobTarget} from '../types';
import {generateId} from '../utils/id';

/**
 * Import รายการเป้าหมายที่ต้องส่งคำคู่ความจาก CSV
 * CSV ควรมีคอลัมน์: case_number, case_number_red?, defendant_name, address, lat, lng, note?
 */
export async function pickAndParseTargetCsv(): Promise<JobTarget[]> {
  const res = await DocumentPicker.pickSingle({
    type: [DocumentPicker.types.csv],
  });
  const content = await RNFS.readFile(res.uri, 'utf8');
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim().toLowerCase(),
  });

  return parsed.data.map(r => {
    const lat = parseFloat(r.lat ?? '');
    const lng = parseFloat(r.lng ?? '');
    const hasGeo = !isNaN(lat) && !isNaN(lng);
    const target: JobTarget = {
      id: generateId(),
      caseNumber: r.case_number ?? r['เลขคดีดำ'] ?? '',
      caseNumberRed: r.case_number_red ?? r['เลขคดีแดง'],
      defendantName: r.defendant_name ?? r['ชื่อจำเลย'],
      address: r.address ?? r['ที่อยู่'] ?? '',
      note: r.note ?? r['หมายเหตุ'],
      location: hasGeo
        ? {latitude: lat, longitude: lng, timestamp: Date.now()}
        : undefined,
    };
    return target;
  });
}
