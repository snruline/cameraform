import {v4 as uuidv4} from 'uuid';

/** สร้าง id ใหม่ (ใช้ UUIDv4) */
export function generateId(): string {
  return uuidv4();
}
