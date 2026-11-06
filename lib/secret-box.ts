/**
 * secret-box — 攤位金流金鑰的加解密(Phase 34,2026-11-06)
 *
 * AES-256-GCM,金鑰來自環境變數 PAYMENT_CONFIG_KEY(32 bytes,base64 / base64url 都收)。
 * 密文格式:'v1.<iv>.<ct>.<tag>'(三段 base64url;iv 12 bytes、tag 16 bytes)。
 * AAD 由呼叫端帶 `${tenantId}:${gateway}.${field}`,把密文綁死在「這個攤位的這個欄位」:
 * 把 A 攤位的密文搬到 B、或把 hash_key 密文塞進 hash_iv,解密一律 auth_failed,不會拿到別人的金鑰。
 *
 * 這個檔案只碰 node:crypto:不讀 DB、不 import supabase、不 console.* 任何東西。
 * 金鑰 Buffer 不放進任何 error / log。每次呼叫都重讀環境變數,不做 module-level cache
 *(避免熱 lambda 吃到舊值、避免 build 階段 import 時丟錯)。
 *
 * 遺失 PAYMENT_CONFIG_KEY = 所有攤位的金流金鑰要重填;換了 key 所有既有密文會 auth_failed。
 * 不做 KDF(key 本身就是隨機 32 bytes)、不做多把 key 輪換(v1. 前綴留給日後工具)。
 */
import crypto from 'node:crypto';

export type SecretBoxErrorCode = 'no_key' | 'bad_key' | 'bad_format' | 'auth_failed';

export class SecretBoxError extends Error {
  constructor(public readonly code: SecretBoxErrorCode) {
    super(`secret-box: ${code}`);
    this.name = 'SecretBoxError';
  }
}

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const VERSION = 'v1';

/** 每次呼叫重讀環境變數;沒設丟 no_key、長度不對丟 bad_key */
function loadKey(): Buffer {
  const raw = process.env.PAYMENT_CONFIG_KEY?.trim();
  if (!raw) throw new SecretBoxError('no_key');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) throw new SecretBoxError('bad_key');
  return key;
}

/** PAYMENT_CONFIG_KEY 有設而且 base64 解出來剛好 32 bytes。後台 action 存檔前先問這個。 */
export function isSecretBoxReady(): boolean {
  try {
    loadKey();
    return true;
  } catch (e) {
    if (e instanceof SecretBoxError) return false;
    throw e;
  }
}

/**
 * 加密:每次隨機 12-byte iv(絕不重用、絕不從明文推導),回 'v1.<iv>.<ct>.<tag>'。
 * 沒金鑰丟 SecretBoxError('no_key' | 'bad_key')。
 */
export function sealSecret(plain: string, aad: string): string {
  const key = loadKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plain.trim(), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), ct.toString('base64url'), tag.toString('base64url')].join('.');
}

/**
 * 解密:格式不對丟 'bad_format';tag 驗不過(金鑰換了 / 密文被改 / aad 不符)丟 'auth_failed';
 * 沒金鑰丟 'no_key' | 'bad_key'。原始的 OpenSSL 錯誤不往外帶。
 */
export function openSecret(sealed: string, aad: string): string {
  const parts = (sealed ?? '').split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new SecretBoxError('bad_format');
  const iv = Buffer.from(parts[1], 'base64url');
  const ct = Buffer.from(parts[2], 'base64url');
  const tag = Buffer.from(parts[3], 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new SecretBoxError('bad_format');

  const key = loadKey();
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  try {
    // GCM 的 tag 比對在 OpenSSL 內是 constant-time,不用自己 timingSafeEqual
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    throw new SecretBoxError('auth_failed');
  }
}

/** 顯示用:'••••••••' + 最後 4 碼;長度 <= 4 全遮。 */
export function maskTail(s: string): string {
  const v = s ?? '';
  if (v.length <= 4) return '••••••••';
  return `••••••••${v.slice(-4)}`;
}
