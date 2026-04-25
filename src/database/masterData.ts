import {getDb} from './db';

export interface MasterDataRow {
  id: number;
  source: string;
  label: string;
  value: string;
  meta?: Record<string, any>;
}

/**
 * Bulk insert (ใช้ตอน import CSV) — ครอบ transaction
 */
export async function bulkInsertMasterData(
  source: string,
  rows: {label: string; value: string; meta?: Record<string, any>}[],
): Promise<number> {
  const db = getDb();
  let inserted = 0;
  await db.transaction(tx => {
    for (const r of rows) {
      tx.execute(
        `INSERT OR IGNORE INTO MasterData (source, label, value, meta_json)
         VALUES (?, ?, ?, ?)`,
        [source, r.label, r.value, r.meta ? JSON.stringify(r.meta) : null],
      );
      inserted++;
    }
  });
  return inserted;
}

/**
 * ค้น label ใน source ที่ขึ้นต้นด้วย query (ใช้กับ autocomplete)
 * จำกัด 50 รายการแรกเพื่อประสิทธิภาพ
 */
export async function getMasterData(
  source: string,
  query: string,
  limit = 50,
): Promise<MasterDataRow[]> {
  const db = getDb();
  const res = await db.executeAsync(
    `SELECT id, source, label, value, meta_json
     FROM MasterData
     WHERE source = ? AND label LIKE ?
     ORDER BY label ASC
     LIMIT ?`,
    [source, `%${query}%`, limit],
  );
  const out: MasterDataRow[] = [];
  for (let i = 0; i < (res.rows?.length ?? 0); i++) {
    const r = res.rows!.item(i);
    out.push({
      id: r.id,
      source: r.source,
      label: r.label,
      value: r.value,
      meta: r.meta_json ? JSON.parse(r.meta_json) : undefined,
    });
  }
  return out;
}

/** ล้างตารางทั้ง source (เช่น ก่อน import ใหม่) */
export async function clearMasterData(source: string): Promise<void> {
  const db = getDb();
  await db.executeAsync('DELETE FROM MasterData WHERE source = ?', [source]);
}
