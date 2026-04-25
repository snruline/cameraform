import * as Keychain from 'react-native-keychain';
import Aes from 'react-native-aes-crypto';

const KEY_SERVICE = 'CameraForm.MasterKey';
const KEY_USERNAME = 'master-aes-key';

const PASS_SERVICE = 'CameraForm.ViewerPass';
const PASS_USERNAME = 'viewer';

// PBKDF2 parameters — 200k iterations is a reasonable lower bound
// สำหรับอุปกรณ์มือถือปี 2024+ (OWASP แนะนำ ≥ 210,000 สำหรับ SHA-256)
const PBKDF2_ITERATIONS = 200_000;
const PBKDF2_KEY_BYTES = 32; // 256-bit derived key
const SALT_BYTES = 16; // 128-bit salt
const PASS_HASH_VERSION = 1;

/**
 * จัดการ master AES key ที่เก็บในที่ปลอดภัยของ OS:
 * - iOS: Keychain (hardware-backed เมื่อมี Secure Enclave)
 * - Android: Keystore
 *
 * Key ถูกสร้างครั้งแรกเมื่อ app เปิด ถ้าไม่มี key ใน Keychain
 * user ไม่ควรต้องรู้หรือจัดการ key เอง (ยกเว้นตั้งรหัสเพิ่ม)
 */
export async function getOrCreateMasterKey(): Promise<string> {
  const existing = await Keychain.getGenericPassword({service: KEY_SERVICE});
  if (existing && existing.password) {
    return existing.password;
  }

  // key ใหม่: 256-bit, สุ่มด้วย Aes.randomKey
  const key = await Aes.randomKey(32); // 32 bytes = 256 bit, return hex
  await Keychain.setGenericPassword(KEY_USERNAME, key, {
    service: KEY_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    // Android: เก็บผ่าน Android Keystore (AES-CBC) — iOS จะใช้ Keychain อยู่แล้ว
    storage: Keychain.STORAGE_TYPE.AES,
  });
  return key;
}

/**
 * ตั้ง/เปลี่ยน viewer passphrase
 *
 * เก็บเป็น `v1:salt:pbkdf2Hash` ใน Keychain — ไม่เก็บ plaintext
 * ใช้ PBKDF2-HMAC-SHA256, 200k iterations, salt สุ่ม 128-bit
 */
export async function setViewerPassphrase(passphrase: string): Promise<void> {
  if (passphrase.length < 6) {
    throw new Error('Passphrase must be at least 6 characters');
  }
  const salt = await Aes.randomKey(SALT_BYTES); // hex (32 chars)
  const hash = await Aes.pbkdf2(
    passphrase,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEY_BYTES,
    'sha256',
  );
  const stored = `v${PASS_HASH_VERSION}:${salt}:${hash}`;
  await Keychain.setGenericPassword(PASS_USERNAME, stored, {
    service: PASS_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    storage: Keychain.STORAGE_TYPE.AES,
  });
}

/**
 * ตรวจ passphrase — คืน true ถ้าตรง
 * ใช้ constant-time compare เพื่อกัน timing attack
 */
export async function verifyViewerPassphrase(
  input: string,
): Promise<boolean> {
  const res = await Keychain.getGenericPassword({service: PASS_SERVICE});
  if (!res || !res.password) return false;

  const parts = res.password.split(':');
  if (parts.length !== 3 || parts[0] !== `v${PASS_HASH_VERSION}`) {
    // ฟอร์แมตเก่า / ไม่รู้จัก → ปฏิเสธ (บังคับตั้งใหม่)
    return false;
  }
  const [, salt, expectedHash] = parts;
  const inputHash = await Aes.pbkdf2(
    input,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEY_BYTES,
    'sha256',
  );
  return constantTimeEqual(inputHash, expectedHash);
}

/** เคยตั้ง passphrase มาก่อนไหม — ใช้ใน UI เพื่อเลือกว่าจะให้ "ตั้งครั้งแรก" หรือ "ปลดล็อก" */
export async function hasViewerPassphrase(): Promise<boolean> {
  const res = await Keychain.getGenericPassword({service: PASS_SERVICE});
  return !!(res && res.password);
}

/**
 * เทียบสตริงแบบ constant-time — กันการอนุมาน hash จากเวลาที่ใช้เทียบ
 * ต้องทำงานเท่ากันทุกไบต์ ถึงแม้ความยาวต่างกันก็ตาม
 */
export function constantTimeEqual(a: string, b: string): boolean {
  // ถ้าความยาวต่าง → return false แต่ยังรันลูปให้ครบเพื่อไม่รั่วผ่าน timing
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}
