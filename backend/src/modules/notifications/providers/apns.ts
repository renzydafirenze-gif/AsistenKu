import http2 from 'node:http2';
import { SignJWT, importPKCS8 } from 'jose';
import type { PushMessage, PushProvider, PushResult } from '../types';

interface ApnsConfig {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
  useSandbox: boolean;
}

/**
 * Apple Push Notification service provider (iOS).
 * Uses the token-based (ES256 JWT) auth scheme over HTTP/2.
 */
export class ApnsProvider implements PushProvider {
  readonly channel = 'APNS' as const;
  private cachedJwt: { value: string; issuedAt: number } | null = null;

  constructor(private readonly config: ApnsConfig) {}

  async send(message: PushMessage): Promise<PushResult> {
    const host = this.config.useSandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
    const client = http2.connect(host);
    try {
      const jwt = await this.authorizationToken();
      return await new Promise<PushResult>((resolve) => {
        const request = client.request({
          ':method': 'POST',
          ':path': `/3/device/${message.token}`,
          authorization: `bearer ${jwt}`,
          'apns-topic': this.config.bundleId,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'content-type': 'application/json',
        });

        let status = 0;
        let body = '';
        request.on('response', (headers) => {
          status = Number(headers[':status'] ?? 0);
        });
        request.setEncoding('utf8');
        request.on('data', (chunk: string) => {
          body += chunk;
        });
        request.on('end', () => {
          resolve({ ok: status === 200, error: status === 200 ? undefined : `APNS ${status}: ${body.slice(0, 300)}` });
        });
        request.on('error', (error) => resolve({ ok: false, error: error.message }));
        request.end(
          JSON.stringify({
            aps: { alert: { title: message.title, body: message.body }, sound: 'default' },
            ...message.data,
          }),
        );
      });
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'APNS request failed' };
    } finally {
      client.close();
    }
  }

  private async authorizationToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedJwt && now - this.cachedJwt.issuedAt < 3000) return this.cachedJwt.value;

    const key = await importPKCS8(this.config.privateKey.replace(/\\n/g, '\n'), 'ES256');
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.config.keyId })
      .setIssuer(this.config.teamId)
      .setIssuedAt(now)
      .sign(key);
    this.cachedJwt = { value: jwt, issuedAt: now };
    return jwt;
  }
}