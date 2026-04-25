/**
 * Types สำหรับ Dynamic Form Builder
 * ใช้เป็น JSON Schema ที่ตรงกับโครงสร้างฟอร์มใน Google Form Style
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'autocomplete'
  | 'date'
  | 'datetime'
  | 'checkbox'
  | 'toggle';

export interface FieldOption {
  label: string;
  value: string;
}

/**
 * การตั้งค่าของ 1 ฟิลด์ในฟอร์ม
 * id        - unique id ใช้อ้างอิงเมื่อบันทึก
 * type      - ชนิด input
 * label     - ข้อความแสดงให้ user เห็น
 * isEncrypted - ถ้า true = ฟิลด์นี้จะถูกเข้ารหัส AES-256 ก่อนฝัง EXIF
 * source    - ชื่อตาราง MasterData ใน SQLite (ใช้กับ autocomplete / select)
 * options   - static options สำหรับ select/autocomplete ที่ไม่ได้มาจาก DB
 * required  - บังคับกรอกไหม
 * placeholder
 * defaultValue
 * order     - ลำดับการแสดงผล
 */
export interface FieldConfig {
  id: string;
  type: FieldType;
  label: string;
  isEncrypted: boolean;
  source?: string;
  options?: FieldOption[];
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  order: number;
  helperText?: string;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string; // regex string
  };
}

/**
 * FormConfig = ฟอร์ม 1 ชุด ประกอบด้วยฟิลด์หลายตัว
 * ใช้เป็น Schema หลักที่ user สร้าง/แก้ไขได้ผ่าน FormBuilder
 */
export interface FormConfig {
  id: string;
  name: string;
  description?: string;
  version: number;
  fields: FieldConfig[];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

/**
 * ตัวแทน 1 choice ที่ผู้ใช้เลือกจาก select/autocomplete
 * เก็บทั้ง label (human-readable) และ value (id สำหรับ join master data)
 */
export interface ChoiceValue {
  label: string;
  value: string;
}

/** Type guard สำหรับเช็คว่าค่าเป็น ChoiceValue */
export function isChoiceValue(x: unknown): x is ChoiceValue {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as any).label === 'string' &&
    typeof (x as any).value === 'string'
  );
}

/**
 * แปลงค่าฟิลด์ใด ๆ เป็นสตริงสำหรับแสดงผล
 * - ChoiceValue → label (แสดงให้อ่านรู้เรื่อง)
 * - primitive → String(x)
 * - null/undefined → '—'
 *
 * ใช้ใน Gallery/Viewer — backward-compat กับภาพเก่าที่เป็น primitive
 */
export function formatFieldValue(v: unknown): string {
  if (v == null) return '—';
  if (isChoiceValue(v)) return v.label;
  return String(v);
}

/**
 * ค่าที่กรอกจริงในฟิลด์
 * - primitive สำหรับ text/number/checkbox/toggle
 * - ChoiceValue สำหรับ select/autocomplete (เก็บคู่ label + value)
 */
export type FieldInputValue =
  | string
  | number
  | boolean
  | ChoiceValue
  | null;

export interface FieldValue {
  fieldId: string;
  label: string;
  value: FieldInputValue;
  isEncrypted: boolean;
}

/**
 * ผลลัพธ์หลังประมวลผล (แยกส่วน public / private)
 *
 * Scheme: AES-256-CBC + HMAC-SHA256 (Encrypt-then-MAC)
 *   private = ciphertext (base64), iv = 128-bit IV (hex),
 *   mac = HMAC-SHA256(iv || cipher) (hex) — ตรวจก่อนถอดรหัสเพื่อยืนยัน integrity
 */
export interface ProcessedFormData {
  public: Record<string, FieldInputValue>;
  private: string | null; // ciphertext (AES-256-CBC base64)
  iv?: string; // initialization vector (hex)
  mac?: string; // HMAC-SHA256(iv || cipher) (hex)
  formId: string;
  version: number;
  processedAt: string;
  /** ตั้งค่าเมื่อข้อมูลถูกแก้ไขผ่าน Gallery — ไม่เปลี่ยน processedAt เพื่อคงประวัติเดิม */
  editedAt?: string;
}
