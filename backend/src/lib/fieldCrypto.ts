import crypto from 'node:crypto';
import { env } from '../config/env';

/**
 * Application-layer envelope encryption for sensitive columns (PII at rest).
 *
 * Format: `v1:<iv-b64>:<tag-b64>:<ciphertext-b64>` (AES-256-GCM).
 * The version prefix allows a future key rotation without a big-bang rewrite.
 *
 * The PostgreSQL migration additionally enables pgcrypto so DBA/backup access is
 * protected too; application-level encryption is the primary control because it
 * keeps plaintext out of the database process entirely.
 */
const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (!cachedKey) {
    const buf = Buffer.from(env.FIELD_ENCRYPTION_KEY, 'hex');
    if (buf.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must decode to 32 bytes');
    cachedKey = buf;
  }
  return cachedKey;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}:`) && value.split(':').length === 4;
}

export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptField(payload: string): string {
  if (!isEncrypted(payload)) {
    throw new Error('Malformed encrypted payload: expected v1:<iv>:<tag>:<ciphertext>');
  }
  const [, ivB64, tagB64, dataB64] = payload.split(':');
  const iv = Buffer.from(ivB64!, 'base64');
  const tag = Buffer.from(tagB64!, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Malformed encrypted payload: bad IV or auth tag length');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(dataB64!, 'base64')), decipher.final()]).toString('utf8');
}

export function encryptOptional(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  return encryptField(value);
}

/** Decrypts tolerantly: unknown/legacy plaintext is returned untouched. */
export function decryptOptional(value: string | null | undefined): string | null {
  if (!value) return null;
  return isEncrypted(value) ? decryptField(value) : value;
}

/** Deterministic keyed hash, used for lookups on encrypted/unique columns. */
export function blindIndex(value: string): string {
  return crypto.createHmac('sha256', key()).update(value.trim().toLowerCase()).digest('hex');
}

/** Opaque tokens (refresh tokens, push job secrets) are stored hashed. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function randomToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Constant-time string comparison for secrets coming from the network. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
