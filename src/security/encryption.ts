import Aes from 'react-native-aes-crypto';
import {FieldValue, ProcessedFormData} from '../types';
import {getOrCreateMasterKey, constantTimeEqual} from './keyManager';

/**
 * เข้ารหัสแบบ Authenticated Encryption (Encrypt-then-MAC)
 *
 * react-native-aes-crypto 3.x ไม่มี AES-GCM — ใช้ aes-256-cbc + HMAC-SHA256 แทน
 * โครงสร้าง:
 *   iv     : สุ่มใหม่ทุกครั้ง 128-bit
 *   cipher : AES-256-CBC(plaintext, encKey, iv)
 *   mac    : HMAC-SHA256(iv || cipher, authKey)
 *
 * encKey  = masterKey (256-bit จาก Keychain)
 * authKey = HMAC-SHA256(masterKey, AUTH_KEY_LABEL) — แยก domain เพื่อไม่ให้ใช้ key เดียวกับ encryption
 *
 * รูปแบบนี้ปลอดภัยต่อ chosen-ciphertext attacks เมื่อเทียบ mac แบบ constant-time
 */
const AUTH_KEY_LABEL = 'cameraform.auth.v1';

let cachedAuthKey: string | null = null;
let cachedAuthKeySource: string | null = null;

async function getAuthKey(masterKey: string): Promise<string> {
  if (cachedAuthKey && cachedAuthKeySource === masterKey) {
    return cachedAuthKey;
  }
  const k = await Aes.hmac256(AUTH_KEY_LABEL, masterKey);
  cachedAuthKey = k;
  cachedAuthKeySource = masterKey;
  return k;
}

export interface EncryptedBlob {
  cipher: string;
  iv: string;
  mac: string;
}

export async function encryptString(plaintext: string): Promise<EncryptedBlob> {
  const masterKey = await getOrCreateMasterKey();
  const authKey = await getAuthKey(masterKey);

  const iv = await Aes.randomKey(16); // 16 bytes = 128-bit IV สำหรับ CBC
  const cipher = await Aes.encrypt(plaintext, masterKey, iv, 'aes-256-cbc');
  const mac = await Aes.hmac256(iv + cipher, authKey);

  return {cipher, iv, mac};
}

export async function decryptString(
  cipher: string,
  iv: string,
  mac: string,
): Promise<string> {
  const masterKey = await getOrCreateMasterKey();
  const authKey = await getAuthKey(masterKey);

  // MAC verification ก่อนถอดรหัส — ถ้าโดนแก้ ciphertext หรือ iv จะจับได้ทันที
  const expectedMac = await Aes.hmac256(iv + cipher, authKey);
  if (!constantTimeEqual(mac, expectedMac)) {
    throw new Error(
      'Authentication failed — ciphertext or IV has been tampered with',
    );
  }

  return Aes.decrypt(cipher, masterKey, iv, 'aes-256-cbc');
}

/**
 * แยกฟิลด์ public/private ตาม flag isEncrypted
 * - public: เก็บใน metadata ของภาพเป็น plaintext
 * - private: รวมเป็น JSON เดียวแล้วเข้ารหัส → ฝังใน EXIF UserComment
 */
export async function processFormData(
  fieldValues: FieldValue[],
  formId: string,
  version: number,
): Promise<ProcessedFormData> {
  const publicData: Record<string, any> = {};
  const sensitiveData: Record<string, any> = {};

  for (const fv of fieldValues) {
    if (fv.isEncrypted) {
      sensitiveData[fv.label] = fv.value;
    } else {
      publicData[fv.label] = fv.value;
    }
  }

  let cipher: string | null = null;
  let iv: string | undefined;
  let mac: string | undefined;
  if (Object.keys(sensitiveData).length > 0) {
    const blob = await encryptString(JSON.stringify(sensitiveData));
    cipher = blob.cipher;
    iv = blob.iv;
    mac = blob.mac;
  }

  return {
    public: publicData,
    private: cipher,
    iv,
    mac,
    formId,
    version,
    processedAt: new Date().toISOString(),
  };
}

/**
 * ย้อนกลับ: ถอดรหัส ProcessedFormData → รวม public + private เป็น record เดียว
 * ใช้ในหน้า Viewer (ต้องผ่าน viewer passphrase ก่อน)
 *
 * Throw ถ้า MAC ไม่ match — ภาพถูกแก้ / ถูกปลอม / ถูกบีบอัดซ้ำจนไบต์เพี้ยน
 */
export async function reconstructFormData(
  processed: ProcessedFormData,
): Promise<Record<string, any>> {
  const result: Record<string, any> = {...processed.public};
  if (processed.private && processed.iv && processed.mac) {
    const json = await decryptString(
      processed.private,
      processed.iv,
      processed.mac,
    );
    Object.assign(result, JSON.parse(json));
  } else if (processed.private) {
    // legacy: ภาพเก่าก่อนอัปเกรดเป็น Encrypt-then-MAC
    throw new Error(
      'Legacy ciphertext without MAC — cannot verify authenticity. ' +
        'Re-capture this photo with the current app version.',
    );
  }
  return result;
}
