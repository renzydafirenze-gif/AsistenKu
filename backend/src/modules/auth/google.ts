import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../../config/env';
import { ServiceUnavailableError, UnauthorizedError } from '../../lib/errors';
import { logger } from '../../lib/logger';

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export interface GoogleTokenVerifier {
  verify(idToken: string): Promise<GoogleIdentity>;
}

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS = new URL('https://www.googleapis.com/oauth2/v3/certs');

/**
 * Verifies Google ID tokens locally against Google's JWKS (no per-login call to
 * Google beyond the cached key set). Audience is pinned to the configured client
 * ids, so a token minted for another app is rejected.
 */
export class JoseGoogleVerifier implements GoogleTokenVerifier {
  private readonly audience: string[];

  constructor(clientIds: string[]) {
    this.audience = clientIds.filter(Boolean);
    if (this.audience.length === 0) {
      throw new ServiceUnavailableError('GOOGLE_CLIENT_ID belum dikonfigurasi');
    }
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(idToken, createRemoteJWKSet(GOOGLE_JWKS), {
        issuer: GOOGLE_ISSUERS,
        audience: this.audience,
      });
      payload = result.payload;
    } catch (error) {
      logger.warn({ err: error }, 'google id token rejected');
      throw new UnauthorizedError('Token Google tidak valid');
    }

    const sub = payload.sub;
    const email = payload.email;
    if (typeof sub !== 'string' || typeof email !== 'string') {
      throw new UnauthorizedError('Token Google tidak memuat identitas');
    }
    return {
      sub,
      email: email.toLowerCase(),
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
      name: typeof payload.name === 'string' ? payload.name : undefined,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined,
    };
  }
}

const googleClientIds = (env.GOOGLE_CLIENT_IDS ?? env.GOOGLE_CLIENT_ID ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

let cachedVerifier: GoogleTokenVerifier | null = null;

/** Lazily built so the app boots without Google configured (dev/test). */
export function defaultGoogleVerifier(): GoogleTokenVerifier {
  if (!cachedVerifier) cachedVerifier = new JoseGoogleVerifier(googleClientIds);
  return cachedVerifier;
}

/**
 * Boot-safe wrapper: constructing the verifier fails when no client id is set,
 * so the failure is deferred to the first `/auth/google` call (503) instead of
 * crashing the process at startup.
 */
export function lazyGoogleVerifier(): GoogleTokenVerifier {
  return { verify: (idToken) => defaultGoogleVerifier().verify(idToken) };
}
