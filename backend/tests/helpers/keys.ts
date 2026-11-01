import { generateKeyPairSync } from 'node:crypto';

/**
 * Throwaway EC key for APNS tests. Generated at import time so no key material
 * is ever committed to the repository.
 */
const { privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

export const EC_PRIVATE_KEY = privateKey;
