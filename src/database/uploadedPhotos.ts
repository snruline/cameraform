import {getDb} from './db';

/**
 * UploadedPhotos — รูปที่ผู้ใช้อัพโหลดจากเครื่องเพื่อ pin บนแผนที่
 * แยกออกจาก JobPhotos (รูปที่ถ่ายผ่านแอปพร้อมฟอร์ม) — เพื่อให้หน้า Map
 * แบ่งมุมมองได้ชัด (Gallery = JobPhotos, Image = UploadedPhotos)
 *
 * ไม่มี encrypted metadata — แค่พิกัดจาก EXIF + path ของไฟล์
 */
export interface UploadedPhotoRow {
  id: string;
  filePath: string;
  thumbnailPath?: string;
  latitude: number;
  longitude: number;
  /** DateTimeOriginal จาก EXIF (ถ้ามี) — ISO string */
  capturedAt?: string;
  /** timestamp ตอน insert เข้า DB */
  uploadedAt: string;
  originalName?: string;
}

export interface AddUploadedPhotoInput {
  id: string;
  filePath: string;
  thumbnailPath?: string | null;
  latitude: number;
  longitude: number;
  capturedAt?: string | null;
  uploadedAt: string;
  originalName?: string | null;
}

export async function addUploadedPhoto(
  photo: AddUploadedPhotoInput,
): Promise<void> {
  const db = getDb();
  await db.executeAsync(
    `INSERT INTO UploadedPhotos
       (id, file_path, thumbnail_path, latitude, longitude,
        captured_at, uploaded_at, original_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      photo.id,
      photo.filePath,
      photo.thumbnailPath ?? null,
      photo.latitude,
      photo.longitude,
      photo.capturedAt ?? null,
      photo.uploadedAt,
      photo.originalName ?? null,
    ],
  );
}

export async function listUploadedPhotos(
  limit = 500,
): Promise<UploadedPhotoRow[]> {
  const db = getDb();
  const res = await db.executeAsync(
    `SELECT id, file_path, thumbnail_path, latitude, longitude,
            captured_at, uploaded_at, original_name
       FROM UploadedPhotos
      ORDER BY uploaded_at DESC
      LIMIT ?`,
    [limit],
  );
  const out: UploadedPhotoRow[] = [];
  for (let i = 0; i < (res.rows?.length ?? 0); i++) {
    const r = res.rows!.item(i);
    out.push({
      id: r.id,
      filePath: r.file_path,
      thumbnailPath: r.thumbnail_path ?? undefined,
      latitude: r.latitude,
      longitude: r.longitude,
      capturedAt: r.captured_at ?? undefined,
      uploadedAt: r.uploaded_at,
      originalName: r.original_name ?? undefined,
    });
  }
  return out;
}

export async function deleteUploadedPhoto(id: string): Promise<void> {
  const db = getDb();
  await db.executeAsync('DELETE FROM UploadedPhotos WHERE id = ?', [id]);
}

/**
 * ลบรูปอัพโหลดทั้งหมด — ใช้กับปุ่ม "Clear all" ในหน้า Map
 * (ไม่แตะไฟล์ใน documentDirectory จริง — แค่ลบ row ใน DB)
 */
export async function clearAllUploadedPhotos(): Promise<number> {
  const db = getDb();
  const res = await db.executeAsync('DELETE FROM UploadedPhotos');
  return res.rowsAffected ?? 0;
}
