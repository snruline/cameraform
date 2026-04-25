import {open, QuickSQLiteConnection} from 'react-native-quick-sqlite';
import {DEFAULT_FORM} from '../config/defaultForm';

const DB_NAME = 'cameraform.db';

let db: QuickSQLiteConnection | null = null;

/** เปิด (หรือสร้าง) database + รัน migration */
export function getDb(): QuickSQLiteConnection {
  if (!db) {
    db = open({name: DB_NAME});
    migrate(db);
    seedDefaults(db);
  }
  return db;
}

function migrate(conn: QuickSQLiteConnection): void {
  conn.execute(`
    CREATE TABLE IF NOT EXISTS FormConfigs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      schema_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  conn.execute(`
    CREATE TABLE IF NOT EXISTS MasterData (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      label TEXT NOT NULL,
      value TEXT NOT NULL,
      meta_json TEXT,
      UNIQUE(source, value)
    );
  `);

  conn.execute(`
    CREATE INDEX IF NOT EXISTS idx_masterdata_source_label
    ON MasterData(source, label);
  `);

  conn.execute(`
    CREATE TABLE IF NOT EXISTS JobHistory (
      id TEXT PRIMARY KEY,
      form_config_id TEXT NOT NULL,
      target_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      submitted_at TEXT,
      FOREIGN KEY (form_config_id) REFERENCES FormConfigs(id)
    );
  `);

  conn.execute(`
    CREATE TABLE IF NOT EXISTS JobPhotos (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      accuracy REAL,
      captured_at TEXT NOT NULL,
      form_data_public_json TEXT,
      form_data_cipher TEXT,
      form_data_iv TEXT,
      form_data_mac TEXT,
      FOREIGN KEY (job_id) REFERENCES JobHistory(id)
    );
  `);

  // idempotent ALTER: สำหรับเครื่องที่เคยติดตั้งเวอร์ชันก่อนเพิ่ม mac
  ensureColumn(conn, 'JobPhotos', 'form_data_mac', 'TEXT');
  // v3: เก็บ form_config_id ตรง ๆ ในแต่ละภาพ — ไม่ต้องพึ่ง JobHistory
  // (CameraScreen เวอร์ชันเดิมใส่ job_id='pending' ทำให้ JOIN หาไม่เจอ)
  ensureColumn(conn, 'JobPhotos', 'form_config_id', 'TEXT');

  // v4: รูปที่ผู้ใช้อัพโหลดจากเครื่อง (ไม่ได้ถ่ายผ่าน CameraScreen) —
  // เก็บแยกจาก JobPhotos เพื่อ:
  //   (1) ไม่ปนกับ Gallery ที่ผูกกับฟอร์ม
  //   (2) ใช้ในหน้า Map → แท็บ "Image" เพื่อ pin พิกัดจาก EXIF GPS
  //       ของรูปเอง โดยไม่ต้องแตะโครงสร้างข้อมูล JobPhotos เดิม
  // ไม่มี form_data / cipher — เก็บแค่ไฟล์ + พิกัด
  conn.execute(`
    CREATE TABLE IF NOT EXISTS UploadedPhotos (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      captured_at TEXT,
      uploaded_at TEXT NOT NULL,
      original_name TEXT
    );
  `);
}

/**
 * เช็คผ่าน PRAGMA table_info ก่อน ALTER — SQLite โยน error ถ้า column ซ้ำ
 * และ react-native-quick-sqlite ไม่มี if-not-exists สำหรับ ADD COLUMN
 */
function ensureColumn(
  conn: QuickSQLiteConnection,
  table: string,
  column: string,
  type: string,
): void {
  const info = conn.execute(`PRAGMA table_info(${table});`);
  const rows = info.rows;
  let exists = false;
  for (let i = 0; i < (rows?.length ?? 0); i++) {
    if (rows!.item(i).name === column) {
      exists = true;
      break;
    }
  }
  if (!exists) {
    conn.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
  }
}

/**
 * ใส่ DEFAULT_FORM ลง FormConfigs ถ้ายังไม่มี id นี้ในตาราง
 * — เพื่อให้หน้า Edit metadata มี form ให้ fallback ได้เสมอ
 *   (CameraScreen ถ่ายภาพโดยใช้ DEFAULT_FORM เป็น state เริ่มต้น
 *    แต่ DEFAULT_FORM ไม่เคยถูก save ลง DB จนกว่าผู้ใช้จะไปแก้ในหน้า
 *    Form tab — ถ้าผู้ใช้ไม่เคยกดบันทึก ฟอร์มจะไม่อยู่ใน DB เลย)
 */
function seedDefaults(conn: QuickSQLiteConnection): void {
  const check = conn.execute(
    'SELECT 1 FROM FormConfigs WHERE id = ? LIMIT 1',
    [DEFAULT_FORM.id],
  );
  if ((check.rows?.length ?? 0) > 0) return;
  conn.execute(
    `INSERT INTO FormConfigs
       (id, name, description, version, schema_json, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      DEFAULT_FORM.id,
      DEFAULT_FORM.name,
      DEFAULT_FORM.description ?? null,
      DEFAULT_FORM.version,
      JSON.stringify(DEFAULT_FORM.fields),
      DEFAULT_FORM.isActive ? 1 : 0,
      DEFAULT_FORM.createdAt,
      DEFAULT_FORM.updatedAt,
    ],
  );
}
