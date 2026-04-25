import {JobRecord, JobPhoto, JobStatus} from '../types';
import {getDb} from './db';

export async function createJob(job: JobRecord): Promise<void> {
  const db = getDb();
  await db.executeAsync(
    `INSERT INTO JobHistory (id, form_config_id, target_json, status, created_at, completed_at, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      job.id,
      job.formConfigId,
      JSON.stringify(job.target),
      job.status,
      job.createdAt,
      job.completedAt ?? null,
      job.submittedAt ?? null,
    ],
  );
}

export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  completedAt?: string,
): Promise<void> {
  const db = getDb();
  await db.executeAsync(
    'UPDATE JobHistory SET status = ?, completed_at = ? WHERE id = ?',
    [status, completedAt ?? null, jobId],
  );
}

export async function addJobPhoto(
  photo: JobPhoto,
  publicData: Record<string, any> | null,
  cipherText: string | null,
  iv: string | null,
  mac: string | null,
  formConfigId: string | null,
): Promise<void> {
  const db = getDb();
  await db.executeAsync(
    `INSERT INTO JobPhotos (id, job_id, file_path, thumbnail_path, latitude, longitude, accuracy, captured_at, form_data_public_json, form_data_cipher, form_data_iv, form_data_mac, form_config_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      photo.id,
      photo.jobId,
      photo.filePath,
      photo.thumbnailPath ?? null,
      photo.location.latitude,
      photo.location.longitude,
      photo.location.accuracy ?? null,
      photo.capturedAt,
      publicData ? JSON.stringify(publicData) : null,
      cipherText,
      iv,
      mac,
      formConfigId,
    ],
  );
}

/**
 * ดึงภาพทั้งหมดที่ถ่ายล่าสุด (ใหม่ก่อน) พร้อม metadata ทั้ง public และ cipher
 * ใช้ใน GalleryScreen — ไม่ต้องรอ passphrase ก็เห็นรายการ+ภาพ+ข้อมูล public ได้
 */
export interface JobPhotoRow {
  id: string;
  jobId: string;
  filePath: string;
  thumbnailPath?: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  capturedAt: string;
  publicData: Record<string, any> | null;
  cipher: string | null;
  iv: string | null;
  mac: string | null;
  /**
   * form_config_id ที่ใช้ตอนถ่ายภาพนี้ — null สำหรับภาพเก่า
   * ที่ถ่ายก่อนเพิ่ม column นี้
   */
  formConfigId: string | null;
}

export async function listJobPhotos(limit = 200): Promise<JobPhotoRow[]> {
  const db = getDb();
  const res = await db.executeAsync(
    `SELECT id, job_id, file_path, thumbnail_path, latitude, longitude, accuracy,
            captured_at, form_data_public_json, form_data_cipher, form_data_iv,
            form_data_mac, form_config_id
       FROM JobPhotos
      ORDER BY captured_at DESC
      LIMIT ?`,
    [limit],
  );
  const out: JobPhotoRow[] = [];
  for (let i = 0; i < (res.rows?.length ?? 0); i++) {
    const r = res.rows!.item(i);
    let publicData: Record<string, any> | null = null;
    if (r.form_data_public_json) {
      try {
        publicData = JSON.parse(r.form_data_public_json);
      } catch {
        publicData = null;
      }
    }
    out.push({
      id: r.id,
      jobId: r.job_id,
      filePath: r.file_path,
      thumbnailPath: r.thumbnail_path ?? undefined,
      latitude: r.latitude,
      longitude: r.longitude,
      accuracy: r.accuracy ?? undefined,
      capturedAt: r.captured_at,
      publicData,
      cipher: r.form_data_cipher ?? null,
      iv: r.form_data_iv ?? null,
      mac: r.form_data_mac ?? null,
      formConfigId: r.form_config_id ?? null,
    });
  }
  return out;
}

/**
 * อัปเดตเฉพาะ form data (public / cipher / iv / mac) ของภาพที่บันทึกแล้ว
 * ไม่แตะ GPS / capturedAt / filePath / id — ใช้ตอนแก้ไขข้อมูลในภาพจาก Gallery
 *
 * formConfigId (optional): ถ้าส่งมาจะ back-fill column form_config_id
 *   ด้วย COALESCE — ช่วยให้ภาพเก่าที่ไม่มี link ฟอร์ม ได้ link เมื่อถูกแก้ไข
 *   ครั้งแรก. ถ้าส่ง null จะคงค่าเดิม
 */
export async function updateJobPhotoData(
  id: string,
  publicData: Record<string, any> | null,
  cipherText: string | null,
  iv: string | null,
  mac: string | null,
  formConfigId: string | null = null,
): Promise<void> {
  const db = getDb();
  await db.executeAsync(
    `UPDATE JobPhotos
        SET form_data_public_json = ?,
            form_data_cipher = ?,
            form_data_iv = ?,
            form_data_mac = ?,
            form_config_id = COALESCE(?, form_config_id)
      WHERE id = ?`,
    [
      publicData ? JSON.stringify(publicData) : null,
      cipherText,
      iv,
      mac,
      formConfigId,
      id,
    ],
  );
}

export async function deleteJobPhoto(id: string): Promise<void> {
  const db = getDb();
  await db.executeAsync('DELETE FROM JobPhotos WHERE id = ?', [id]);
}

export async function listRecentJobs(limit = 50): Promise<JobRecord[]> {
  const db = getDb();
  const res = await db.executeAsync(
    'SELECT * FROM JobHistory ORDER BY created_at DESC LIMIT ?',
    [limit],
  );
  const out: JobRecord[] = [];
  for (let i = 0; i < (res.rows?.length ?? 0); i++) {
    const r = res.rows!.item(i);
    out.push({
      id: r.id,
      formConfigId: r.form_config_id,
      target: JSON.parse(r.target_json),
      status: r.status,
      createdAt: r.created_at,
      completedAt: r.completed_at ?? undefined,
      submittedAt: r.submitted_at ?? undefined,
      photos: [],
    });
  }
  return out;
}
