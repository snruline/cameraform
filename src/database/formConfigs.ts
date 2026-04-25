import {FormConfig} from '../types';
import {getDb} from './db';
import {DEFAULT_FORM} from '../config/defaultForm';

export async function saveFormConfig(config: FormConfig): Promise<void> {
  const db = getDb();
  await db.executeAsync(
    `INSERT INTO FormConfigs (id, name, description, version, schema_json, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       version = excluded.version,
       schema_json = excluded.schema_json,
       is_active = excluded.is_active,
       updated_at = excluded.updated_at`,
    [
      config.id,
      config.name,
      config.description ?? null,
      config.version,
      JSON.stringify(config.fields),
      config.isActive ? 1 : 0,
      config.createdAt,
      config.updatedAt,
    ],
  );
}

export async function getFormConfig(id: string): Promise<FormConfig | null> {
  const db = getDb();
  const res = await db.executeAsync(
    'SELECT * FROM FormConfigs WHERE id = ?',
    [id],
  );
  const row = res.rows?.item(0);
  if (!row) return null;
  return rowToConfig(row);
}

export async function listFormConfigs(): Promise<FormConfig[]> {
  const db = getDb();
  const res = await db.executeAsync(
    'SELECT * FROM FormConfigs ORDER BY updated_at DESC',
  );
  const out: FormConfig[] = [];
  for (let i = 0; i < (res.rows?.length ?? 0); i++) {
    out.push(rowToConfig(res.rows!.item(i)));
  }
  return out;
}

/**
 * ดึง FormConfig ที่ใช้ตอนถ่ายภาพนั้น
 * ลำดับความพยายาม:
 *   1) ใช้ JobPhotos.form_config_id ตรง ๆ (ภาพใหม่ตั้งแต่ schema v3)
 *   2) JOIN ผ่าน JobHistory (เผื่อมี job จริง)
 *   3) fallback → getActiveFormConfig() (ภาพเก่า legacy ที่ jobId='pending'
 *      และไม่มี form_config_id ใน JobPhotos) — ผู้ใช้ยังแก้ได้ด้วย
 *      ฟอร์ม active ปัจจุบัน
 *
 * ใช้ตอนเข้า edit mode ใน Gallery — เพื่อ render fields ให้ตรง type
 */
export async function getFormConfigForPhoto(
  photoId: string,
): Promise<FormConfig | null> {
  const db = getDb();

  // (1) direct column
  const r1 = await db.executeAsync(
    `SELECT fc.*
       FROM FormConfigs fc
       JOIN JobPhotos jp ON jp.form_config_id = fc.id
      WHERE jp.id = ?
      LIMIT 1`,
    [photoId],
  );
  const row1 = r1.rows?.item(0);
  if (row1) return rowToConfig(row1);

  // (2) legacy JOIN ผ่าน JobHistory
  const r2 = await db.executeAsync(
    `SELECT fc.*
       FROM FormConfigs fc
       JOIN JobHistory jh ON jh.form_config_id = fc.id
       JOIN JobPhotos jp  ON jp.job_id = jh.id
      WHERE jp.id = ?
      LIMIT 1`,
    [photoId],
  );
  const row2 = r2.rows?.item(0);
  if (row2) return rowToConfig(row2);

  // (3) fallback — ใช้ฟอร์มที่ active อยู่ (เปิดให้แก้ไขภาพเก่าได้)
  const active = await getActiveFormConfig();
  if (active) return active;

  // (4) last-resort — ใช้ DEFAULT_FORM (ควรจะถูก seed ใน migrate() แล้ว
  //     แต่เผื่อ DB ถูกเคลียร์ผิดจังหวะ ยังคืน hardcoded config ให้แก้ได้)
  return DEFAULT_FORM;
}

export async function getActiveFormConfig(): Promise<FormConfig | null> {
  const db = getDb();
  const res = await db.executeAsync(
    'SELECT * FROM FormConfigs WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1',
  );
  const row = res.rows?.item(0);
  return row ? rowToConfig(row) : null;
}

function rowToConfig(row: any): FormConfig {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    version: row.version,
    fields: JSON.parse(row.schema_json),
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
