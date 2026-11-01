import { generateKeyPairSync } from 'node:crypto';
import { FcmProvider } from '../src/modules/notifications/providers/fcm';
import { ApnsProvider } from '../src/modules/notifications/providers/apns';
import { DryRunPushProvider, RecordingPushProvider } from '../src/modules/notifications/providers/dryRun';
import { JoseGoogleVerifier } from '../src/modules/auth/google';
import { ServiceUnavailableError, UnauthorizedError } from '../src/lib/errors';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const { privateKey: ecPrivateKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const message = {
  token: 'device-token-1',
  title: 'Piket H-1',
  body: 'Besok piket pagi',
  data: { type: 'DUTY_H1' },
};

describe('FCM provider', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function provider() {
    return new FcmProvider({
      projectId: 'proj',
      clientEmail: 'svc@proj.iam.gserviceaccount.com',
      privateKey,
    });
  }

  it('sends a message with an OAuth access token', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      calls.push(String(url));
      if (String(url).includes('oauth2')) {
        return { ok: true, json: async () => ({ access_token: 'ya29.token', expires_in: 3600 }) } as Response;
      }
      return { ok: true, status: 200, text: async () => '' } as Response;
    }) as never;

    const result = await provider().send(message);
    expect(result).toEqual({ ok: true });
    expect(calls[0]).toContain('oauth2.googleapis.com');
    expect(calls[1]).toContain('/v1/projects/proj/messages:send');
  });

  it('caches the OAuth token between sends', async () => {
    let oauthCalls = 0;
    global.fetch = jest.fn(async (url: string) => {
      if (String(url).includes('oauth2')) {
        oauthCalls += 1;
        return { ok: true, json: async () => ({ access_token: 'cached', expires_in: 3600 }) } as Response;
      }
      return { ok: true, status: 200, text: async () => '' } as Response;
    }) as never;

    const instance = provider();
    await instance.send(message);
    await instance.send(message);
    expect(oauthCalls).toBe(1);
  });

  it('flags an unregistered token as permanently invalid', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (String(url).includes('oauth2')) {
        return { ok: true, json: async () => ({ access_token: 't', expires_in: 3600 }) } as Response;
      }
      return {
        ok: false,
        status: 404,
        text: async () => '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}',
      } as Response;
    }) as never;

    const result = await provider().send(message);
    expect(result.ok).toBe(false);
    expect(result.tokenInvalid).toBe(true);
    expect(result.error).toContain('FCM 404');
  });

  it('treats a 500 as a retryable failure', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (String(url).includes('oauth2')) {
        return { ok: true, json: async () => ({ access_token: 't', expires_in: 3600 }) } as Response;
      }
      return { ok: false, status: 500, text: async () => 'boom' } as Response;
    }) as never;

    const result = await provider().send(message);
    expect(result).toMatchObject({ ok: false, tokenInvalid: false });
  });

  it('surfaces a network error as a failed result instead of throwing', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNRESET');
    }) as never;

    const result = await provider().send(message);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('ECONNRESET');
  });

  it('fails when the OAuth exchange is rejected', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 401 }) as Response) as never;
    const result = await provider().send(message);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('FCM OAuth failed');
  });
});

describe('APNS provider', () => {
  it('rejects when the key cannot be imported', async () => {
    const provider = new ApnsProvider({
      keyId: 'KEY',
      teamId: 'TEAM',
      privateKey: 'not-a-key',
      bundleId: 'com.asisten.app',
      useSandbox: true,
    });
    const result = await provider.send(message);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('builds an ES256 JWT from the configured key', async () => {
    const provider = new ApnsProvider({
      keyId: 'KEY123',
      teamId: 'TEAM123',
      privateKey: ecPrivateKey,
      bundleId: 'com.asisten.app',
      useSandbox: false,
    });
    // Reach into the private token builder: exercising it proves the JWT shape
    // without opening a real HTTP/2 connection to Apple.
    const token = await (provider as unknown as { authorizationToken(): Promise<string> }).authorizationToken();
    const [header, payload] = token.split('.');
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toMatchObject({ alg: 'ES256', kid: 'KEY123' });
    expect(JSON.parse(Buffer.from(payload!, 'base64url').toString()).iss).toBe('TEAM123');
  });
});

describe('dry-run and recording providers', () => {
  it('records every message for assertions', async () => {
    const provider = new RecordingPushProvider('FCM');
    await provider.send(message);
    await provider.send(message);
    expect(provider.sent).toHaveLength(2);
    expect(provider.sent[0]!.title).toBe('Piket H-1');
  });

  it('always succeeds without a network call', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const provider = new DryRunPushProvider('APNS');
    expect(await provider.send(message)).toEqual({ ok: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('Google ID token verifier', () => {
  it('refuses to construct without a client id', () => {
    expect(() => new JoseGoogleVerifier([])).toThrow(ServiceUnavailableError);
  });

  it('rejects a token that is not signed by Google', async () => {
    const verifier = new JoseGoogleVerifier(['client-id.apps.googleusercontent.com']);
    await expect(verifier.verify('not.a.real.token')).rejects.toThrow(UnauthorizedError);
  });
});
