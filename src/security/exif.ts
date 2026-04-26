import RNFS from 'react-native-fs';
import piexif from 'piexifjs';
import {ProcessedFormData, GeoLocation} from '../types';

/**
 * แปลง UTF-8 string ↔ base64 แบบ safe
 *
 * ทำไมต้องทำ: piexifjs ใช้ btoa() ตอน insert EXIF กลับเป็น data URL
 * แต่ btoa() รับเฉพาะ Latin-1 (codepoint 0-255) — เจออักษรไทย/emoji/จีน
 * จะ throw "Found invalid character when converting to base64"
 * → เรา base64-encode payload ก่อน ทำให้ UserComment เป็น ASCII ล้วน
 */
const UC_MARKER = 'B64:'; // marker หน้า payload เพื่อแยก format ใหม่จาก legacy

function utf8ToBase64(str: string): string {
  // encodeURIComponent → percent-encoded UTF-8 bytes
  // unescape → Latin-1 string (แต่ละ byte เป็น char 0-255)
  // btoa → base64 (ปลอดภัย)
  return btoa(unescape(encodeURIComponent(str)));
}

function base64ToUtf8(b64: string): string {
  return decodeURIComponent(escape(atob(b64)));
}

/**
 * ฝัง ProcessedFormData (public + ciphertext) ลงใน EXIF UserComment ของภาพ JPEG
 * + เขียน GPS tag ให้ถูกต้องตาม EXIF spec
 *
 * ข้อแนะนำ: ใช้ piexifjs บน JS thread ได้ แต่ถ้าภาพใหญ่มากควรย้ายไป native module
 */
export async function writeExif(
  filePath: string,
  data: ProcessedFormData,
  location: GeoLocation,
): Promise<void> {
  const raw = await RNFS.readFile(filePath, 'base64');
  // RNFS บางเวอร์ชันบน Android ใส่ \n ทุก 76 ตัว (MIME wrap) — piexif ใช้ atob()
  // ภายในซึ่ง strict มาก เจอช่องว่าง/newline แล้ว throw "invalid character" ทันที
  const base64 = raw.replace(/\s+/g, '');

  // ตรวจ magic bytes ของ JPEG (FFD8FF) ก่อน — piexifjs รองรับเฉพาะ JPEG
  // ถ้า VisionCamera ออกมาเป็น HEIC/PNG จะจับได้ตั้งแต่ตรงนี้ แทนที่จะไป error
  // ลึก ๆ ใน piexif แล้ว stack trace อ่านไม่รู้เรื่อง
  if (!base64.startsWith('/9j/')) {
    throw new Error(
      'Photo is not a JPEG — EXIF embedding requires JPEG format. ' +
        'Check camera format settings.',
    );
  }

  const binary = `data:image/jpeg;base64,${base64}`;

  let exif: any;
  try {
    exif = piexif.load(binary);
  } catch (e: any) {
    throw new Error(`EXIF parse failed: ${e?.message ?? e}`);
  }

  // UserComment: เก็บ JSON ทั้ง public + cipher + iv + mac + meta
  // schema v2 เพิ่ม mac สำหรับ Encrypt-then-MAC; schema เก่า v1 ไม่มี mac
  // v2.1: ห่อ payload ด้วย base64 (+ prefix B64:) เพื่อให้ UserComment เป็น ASCII
  // ล้วน ๆ ไม่งั้น btoa() ของ piexif จะพังเวลาเนื้อหา public มีภาษาไทย/emoji
  const payloadJson = JSON.stringify({
    v: 2,
    form: data.formId,
    ver: data.version,
    at: data.processedAt,
    editedAt: data.editedAt,
    pub: data.public,
    enc: data.private,
    iv: data.iv,
    mac: data.mac,
  });
  const asciiSafePayload = UC_MARKER + utf8ToBase64(payloadJson);
  exif.Exif = exif.Exif ?? {};
  exif.Exif[piexif.ExifIFD.UserComment] = 'ASCII\0\0\0' + asciiSafePayload;

  // GPS
  exif.GPS = {
    [piexif.GPSIFD.GPSLatitudeRef]: location.latitude >= 0 ? 'N' : 'S',
    [piexif.GPSIFD.GPSLatitude]: piexif.GPSHelper.degToDmsRational(
      Math.abs(location.latitude),
    ),
    [piexif.GPSIFD.GPSLongitudeRef]: location.longitude >= 0 ? 'E' : 'W',
    [piexif.GPSIFD.GPSLongitude]: piexif.GPSHelper.degToDmsRational(
      Math.abs(location.longitude),
    ),
    [piexif.GPSIFD.GPSTimeStamp]: formatGpsTime(new Date(location.timestamp)),
    [piexif.GPSIFD.GPSDateStamp]: formatGpsDate(new Date(location.timestamp)),
  };
  if (location.accuracy !== undefined) {
    exif.GPS[piexif.GPSIFD.GPSHPositioningError] = [
      Math.round(location.accuracy * 100),
      100,
    ];
  }

  let newData: string;
  try {
    const exifBytes = piexif.dump(exif);
    newData = piexif.insert(exifBytes, binary);
  } catch (e: any) {
    throw new Error(`EXIF insert failed: ${e?.message ?? e}`);
  }
  const newBase64 = newData
    .replace(/^data:image\/jpeg;base64,/, '')
    .replace(/\s+/g, '');
  await RNFS.writeFile(filePath, newBase64, 'base64');
}

function formatGpsTime(d: Date): [number[], number[], number[]] {
  return [
    [d.getUTCHours(), 1],
    [d.getUTCMinutes(), 1],
    [d.getUTCSeconds(), 1],
  ];
}

function formatGpsDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}:${pad(d.getUTCMonth() + 1)}:${pad(d.getUTCDate())}`;
}

/**
 * แปลง EXIF GPS rational [[num,den], ...] → decimal degrees
 * piexif.GPSHelper มี dmsRationalToDeg แต่บางเวอร์ชันไม่ export เลยเขียนเอง
 */
function rationalToNum(r: number[] | [number, number]): number {
  if (!Array.isArray(r) || r.length < 2 || !r[1]) return 0;
  return r[0] / r[1];
}

function dmsToDeg(dms: number[][]): number {
  if (!Array.isArray(dms) || dms.length < 3) return 0;
  const d = rationalToNum(dms[0]);
  const m = rationalToNum(dms[1]);
  const s = rationalToNum(dms[2]);
  return d + m / 60 + s / 3600;
}

export interface ExifGpsInfo {
  latitude: number;
  longitude: number;
  /** DateTimeOriginal → ISO string (approx — EXIF ไม่เก็บ timezone) */
  capturedAt?: string;
}

/**
 * ดึงพิกัด GPS จาก EXIF ของไฟล์ JPEG
 * — คืน null ถ้าไฟล์ไม่มี GPS หรืออ่านไม่ได้
 * — ใช้สำหรับรูปที่ผู้ใช้ "อัพโหลด" (ไม่ได้ถ่ายผ่านแอป) เพื่อ pin บน Map
 *
 * หมายเหตุ: ไม่เกี่ยวกับ UserComment payload ของแอป — แค่อ่าน GPS IFD ตรง ๆ
 */
export async function readExifGps(
  filePath: string,
): Promise<ExifGpsInfo | null> {
  let raw: string;
  try {
    raw = await RNFS.readFile(filePath, 'base64');
  } catch {
    return null;
  }
  const base64 = raw.replace(/\s+/g, '');
  if (!base64.startsWith('/9j/')) return null;
  const binary = `data:image/jpeg;base64,${base64}`;
  let exif: any;
  try {
    exif = piexif.load(binary);
  } catch {
    return null;
  }
  const gps = exif.GPS ?? {};
  const latArr = gps[piexif.GPSIFD.GPSLatitude];
  const latRef = gps[piexif.GPSIFD.GPSLatitudeRef];
  const lngArr = gps[piexif.GPSIFD.GPSLongitude];
  const lngRef = gps[piexif.GPSIFD.GPSLongitudeRef];

  // ตรวจ DMS array แบบเข้มงวด — ไม่รับ empty array `[]` (truthy ใน JS) หรือ
  // array ที่ไม่ครบ 3 elements (D, M, S)
  // ที่เพิ่มจากเดิม: เดิมใช้ if (!latArr || !lngArr) ซึ่ง [] ผ่าน → dmsToDeg
  // คืน 0 → ทุกภาพได้พิกัด 0,0
  if (!Array.isArray(latArr) || latArr.length !== 3) return null;
  if (!Array.isArray(lngArr) || lngArr.length !== 3) return null;

  let latitude = dmsToDeg(latArr);
  let longitude = dmsToDeg(lngArr);
  if (latRef === 'S') latitude = -latitude;
  if (lngRef === 'W') longitude = -longitude;
  if (!isFinite(latitude) || !isFinite(longitude)) return null;

  // Reject "Null Island" (0,0) — ตำแหน่งกลางมหาสมุทรแอตแลนติกแถบเส้นศูนย์สูตร
  // ที่ EXIF บางรูปเก็บไว้ตอนไม่มี GPS จริง (เช่น รูปจากโปรแกรมตัดต่อ)
  // ถ้าเป็น 0,0 จริง ๆ คงน้อยมาก ใส่ tolerance 0.0001° (~10 m) ปลอดภัย
  if (Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001) return null;

  // Reject ค่าที่นอก range — ป้องกัน garbage data
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  // DateTimeOriginal: "YYYY:MM:DD HH:MM:SS" — แปลงเป็น ISO แบบประมาณ
  // (ไม่มี timezone ใน EXIF — treat as local)
  let capturedAt: string | undefined;
  const dto: string | undefined = exif.Exif?.[piexif.ExifIFD.DateTimeOriginal];
  if (dto) {
    const m = dto.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (m) {
      const [, y, mo, d, h, mi, s] = m;
      const local = new Date(
        Number(y),
        Number(mo) - 1,
        Number(d),
        Number(h),
        Number(mi),
        Number(s),
      );
      if (!isNaN(local.getTime())) capturedAt = local.toISOString();
    }
  }

  return {latitude, longitude, capturedAt};
}

/** อ่าน EXIF กลับเป็น ProcessedFormData (สำหรับ Viewer) */
export async function readExif(filePath: string): Promise<ProcessedFormData | null> {
  const raw = await RNFS.readFile(filePath, 'base64');
  const base64 = raw.replace(/\s+/g, '');
  if (!base64.startsWith('/9j/')) return null;
  const binary = `data:image/jpeg;base64,${base64}`;
  let exif: any;
  try {
    exif = piexif.load(binary);
  } catch {
    return null;
  }
  const userComment: string | undefined = exif.Exif?.[piexif.ExifIFD.UserComment];
  if (!userComment) return null;
  const stripped = userComment.replace(/^ASCII\0\0\0/, '');
  // v2.1+: payload นำหน้าด้วย "B64:" (base64-of-UTF-8 JSON)
  // v2 / v1 legacy: JSON ตรง ๆ
  let jsonStr: string;
  if (stripped.startsWith(UC_MARKER)) {
    try {
      jsonStr = base64ToUtf8(stripped.slice(UC_MARKER.length));
    } catch {
      return null;
    }
  } else {
    jsonStr = stripped;
  }
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      formId: parsed.form,
      version: parsed.ver,
      processedAt: parsed.at,
      editedAt: parsed.editedAt,
      public: parsed.pub,
      private: parsed.enc ?? null,
      iv: parsed.iv,
      mac: parsed.mac, // v2+ only; v1 images จะได้ undefined และ reconstructFormData จะ throw
    };
  } catch {
    return null;
  }
}
