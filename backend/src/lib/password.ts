import bcrypt from 'bcryptjs';
import { env } from '../config/env';

/**
 * Password hashing (bcrypt). `bcryptjs` is used instead of the native binding so
 * the same code runs in Alpine containers and CI without a build toolchain.
 */
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.7Mt5x9bj0QxZ0MhtR0gjVJlt8xXN9Iu';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Runs a dummy comparison when the account does not exist, so login latency does
 * not reveal whether an email is registered (user enumeration defence).
 */
export async function burnPasswordComparison(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH);
}

export const PASSWORD_MIN_LENGTH = 8;

/** 8+ chars, at least one letter and one digit (OWASP ASVS 2.1). */
export function isStrongEnough(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && /[A-Za-z]/.test(password) && /\d/.test(password);
}
