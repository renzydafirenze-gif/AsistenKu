import { SignJWT, importPKCS8 } from 'jose';
import type { PushMessage, PushProvider, PushResult } from '../types';

interface FcmConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

/**
 * Firebase Cloud Messaging HTTP v1 provider (Android).
 * Access tokens are minted from the service-account key and cached for ~50 min.
 */
export class FcmProvider implements PushProvider {
  readonly channel = 'FCM' as const;
  private cached: CachedToken | null = null;

  constructor(private readonly config: FcmConfig) {}

  async send(message: PushMessage): Promise<PushResult> {
    try {
      const accessToken = await this.accessToken();
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.config.projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: message.token,
              notification: { title: message.title, body: message.body },
              data: message.data,
              android: { priority: 'high', notification: { channel_id: 'duty-reminders' } },
            },
          }),
        },
      );

      if (response.ok) return { ok: true };

      const text = await response.text();
      const status = response.status;
      return {
        ok: false,
        error: `FCM ${status}: ${text.slice(0, 300)}`,
        tokenInvalid: status === 404 || text.includes('UNREGISTERED') || text.includes('INVALID_ARGUMENT'),
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'FCM request failed' };
    }
  }

  private async accessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt > Date.now() + 60_000) return this.cached.value;

    const now = Math.floor(Date.now() / 1000);
    const key = await importPKCS8(this.config.privateKey.replace(/\\n/g, '\n'), 'RS256');
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(this.config.clientEmail)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!response.ok) throw new Error(`FCM OAuth failed: ${response.status}`);

    const payload = (await response.json()) as { access_token: string; expires_in: number };
    this.cached = { value: payload.access_token, expiresAt: Date.now() + payload.expires_in * 1000 };
    return this.cached.value;
  }
}