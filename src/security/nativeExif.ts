import {NativeModules, Platform} from 'react-native';

/**
 * Wrapper รอบ native ExifReader module (Android: Kotlin / iOS: Obj-C)
 *
 * ทำไมต้องเขียน native: piexifjs (JS lib) อ่าน EXIF GPS จาก content:// URI
 * บน Android 13+ ไม่ครบ เพราะ Photo Picker strip GPS metadata อัตโนมัติ
 * เพื่อ privacy ก่อนส่งไฟล์ให้แอป
 *
 * Native module ใช้ API ตรง ๆ:
 *   - Android: androidx.exifinterface.ExifInterface กับ ContentResolver
 *   - iOS:     CGImageSource + Photos framework (PHAsset.location)
 *
 * ทั้ง 2 platform คืน {latitude, longitude, dateTimeOriginal?} หรือ null
 */

const {ExifReader} = NativeModules;

export interface NativeGpsResult {
  latitude: number;
  longitude: number;
  /** EXIF DateTimeOriginal raw string "YYYY:MM:DD HH:MM:SS" — JS จะแปลงเป็น ISO เอง */
  dateTimeOriginal?: string;
}

/**
 * อ่าน GPS จากไฟล์ภาพผ่าน native API
 * @param uri ไฟล์ปลายทาง — รองรับ file://, content:// (Android), ph:// (iOS)
 * @returns null ถ้าไม่มี GPS / native module ไม่ได้ติดตั้ง / มี error ใด ๆ
 */
export async function readGpsNative(
  uri: string,
): Promise<NativeGpsResult | null> {
  if (!ExifReader || typeof ExifReader.readGps !== 'function') {
    // Native module ยังไม่ได้ link — fallback เป็น JS implementation
    if (__DEV__) {
      console.warn(
        '[ExifReader] Native module not available — falling back to piexifjs',
      );
    }
    return null;
  }
  try {
    const result = await ExifReader.readGps(uri);
    if (!result) return null;
    return {
      latitude: result.latitude,
      longitude: result.longitude,
      dateTimeOriginal: result.dateTimeOriginal,
    };
  } catch (e) {
    if (__DEV__) {
      console.warn(`[ExifReader] readGps failed for ${uri}:`, e);
    }
    return null;
  }
}

/** ตรวจว่า native module ลงทะเบียนสำเร็จไหม (สำหรับ debug) */
export function isNativeExifAvailable(): boolean {
  return !!ExifReader && typeof ExifReader.readGps === 'function';
}

export const __NATIVE_EXIF_PLATFORM = Platform.OS;
