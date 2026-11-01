import {
  addDays,
  countdownTo,
  diffInDays,
  dutyShiftStart,
  isBeforeToday,
  parseDateKey,
  toDateKey,
  todayKey,
  zonedTimeToUtc,
} from '../src/lib/dates';
import {
  blindIndex,
  decryptField,
  decryptOptional,
  encryptField,
  encryptOptional,
  hashToken,
  isEncrypted,
  randomToken,
  safeEqual,
} from '../src/lib/fieldCrypto';
import { hashPassword, isStrongEnough, verifyPassword } from '../src/lib/password';
import { accessTokenTtlSeconds, signAccessToken, verifyAccessToken } from '../src/lib/jwt';
import { formatHlc, parseHlc, receiveHlc, tickHlc, isValidHlc, compareHlc, mergeFields } from '../src/lib/hlc';
import { UnauthorizedError } from '../src/lib/errors';

describe('dates', () => {
  it('parses and formats date keys round-trip', () => {
    expect(toDateKey(parseDateKey('2026-03-01'))).toBe('2026-03-01');
  });

  it('rejects impossible dates', () => {
    expect(() => parseDateKey('2026-02-30')).toThrow('Tanggal tidak valid');
    expect(() => parseDateKey('01-03-2026')).toThrow('Tanggal tidak valid');
    expect(() => parseDateKey('2026-13-01')).toThrow('Tanggal tidak valid');
  });

  it('computes day differences across month and year boundaries', () => {
    expect(diffInDays(parseDateKey('2026-12-31'), parseDateKey('2027-01-01'))).toBe(1);
    expect(diffInDays(parseDateKey('2026-03-01'), parseDateKey('2026-02-01'))).toBe(-28);
  });

  it('labels countdowns as H-n, today or late', () => {
    const now = parseDateKey('2026-05-10');
    expect(countdownTo(parseDateKey('2026-05-11'), now).label).toBe('H-1');
    expect(countdownTo(parseDateKey('2026-05-10'), now).label).toBe('Hari ini');
    expect(countdownTo(parseDateKey('2026-05-14'), now).label).toBe('H-4');
    expect(countdownTo(parseDateKey('2026-05-08'), now).label).toBe('Terlambat 2 hari');
    expect(countdownTo(parseDateKey('2026-05-08'), now).isPast).toBe(true);
  });

  it('uses the school timezone for "today"', () => {
    // 2026-05-10T18:00Z is already 2026-05-11 01:00 in Asia/Jakarta.
    expect(todayKey(new Date('2026-05-10T18:00:00.000Z'))).toBe('2026-05-11');
    expect(todayKey(new Date('2026-05-10T16:59:00.000Z'))).toBe('2026-05-10');
  });

  it('anchors duty shifts to local wall-clock time', () => {
    // 07:00 Jakarta (UTC+7) is 00:00 UTC.
    expect(dutyShiftStart(parseDateKey('2026-05-11'), 'MORNING').toISOString()).toBe('2026-05-11T00:00:00.000Z');
    // 12:30 Jakarta is 05:30 UTC.
    expect(dutyShiftStart(parseDateKey('2026-05-11'), 'AFTERNOON').toISOString()).toBe('2026-05-11T05:30:00.000Z');
  });

  it('converts arbitrary zoned times', () => {
    expect(zonedTimeToUtc('2026-01-15', 23, 59).toISOString()).toBe('2026-01-15T16:59:00.000Z');
  });

  it('adds days without mutating the input', () => {
    const base = parseDateKey('2026-02-28');
    const next = addDays(base, 1);
    expect(toDateKey(next)).toBe('2026-03-01');
    expect(toDateKey(base)).toBe('2026-02-28');
  });

  it('detects dates before today', () => {
    const now = new Date('2026-05-10T03:00:00.000Z');
    expect(isBeforeToday(parseDateKey('2026-05-09'), now)).toBe(true);
    expect(isBeforeToday(parseDateKey('2026-05-10'), now)).toBe(false);
  });
});

describe('field encryption', () => {
  it('round-trips plaintext', () => {
    const payload = encryptField('081234567890');
    expect(isEncrypted(payload)).toBe(true);
    expect(payload).not.toContain('081234567890');
    expect(decryptField(payload)).toBe('081234567890');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encryptField('same')).not.toBe(encryptField('same'));
  });

  it('detects tampering via the GCM auth tag', () => {
    const payload = encryptField('rahasia');
    const parts = payload.split(':');
    const tampered = [parts[0], parts[1], parts[2], Buffer.from('evil').toString('base64')].join(':');
    expect(() => decryptField(tampered)).toThrow();
  });

  it('rejects malformed payloads', () => {
    expect(() => decryptField('plaintext')).toThrow('Malformed encrypted payload');
    expect(() => decryptField('v1:aaa:bbb:ccc')).toThrow('bad IV or auth tag length');
  });

  it('handles optional values', () => {
    expect(encryptOptional(null)).toBeNull();
    expect(encryptOptional('')).toBeNull();
    expect(decryptOptional(null)).toBeNull();
    expect(decryptOptional('legacy-plaintext')).toBe('legacy-plaintext');
    expect(decryptOptional(encryptField('x'))).toBe('x');
  });

  it('creates a stable blind index', () => {
    expect(blindIndex('User@Example.com')).toBe(blindIndex(' user@example.com '));
    expect(blindIndex('a')).not.toBe(blindIndex('b'));
  });

  it('hashes tokens deterministically and generates unique random tokens', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe('abc');
    expect(randomToken()).not.toBe(randomToken());
  });

  it('compares secrets in constant time', () => {
    expect(safeEqual('secret-value', 'secret-value')).toBe(true);
    expect(safeEqual('secret-value', 'secret-valuE')).toBe(false);
    expect(safeEqual('short', 'longer-value')).toBe(false);
  });
});

describe('password policy', () => {
  it('accepts strong passwords and rejects weak ones', () => {
    expect(isStrongEnough('Rahasia123')).toBe(true);
    expect(isStrongEnough('12345678')).toBe(false);
    expect(isStrongEnough('abcdefgh')).toBe(false);
    expect(isStrongEnough('a1')).toBe(false);
  });

  it('hashes and verifies', async () => {
    const hash = await hashPassword('Rahasia123');
    expect(hash).not.toBe('Rahasia123');
    expect(await verifyPassword('Rahasia123', hash)).toBe(true);
    expect(await verifyPassword('Rahasia124', hash)).toBe(false);
  });
});

describe('access tokens', () => {
  it('signs and verifies a token with the expected claims', () => {
    const { token } = signAccessToken({ id: 'user-1', role: 'STUDENT', classId: 'class-1' });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('STUDENT');
    expect(payload.classId).toBe('class-1');
    expect(payload.type).toBe('access');
    expect(payload.iss).toBe('asistensiswa-test');
    expect(payload.aud).toBe('asistensiswa-test-app');
  });

  it('rejects a tampered payload', () => {
    const { token } = signAccessToken({ id: 'user-1', role: 'STUDENT', classId: null });
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', role: 'TEACHER', type: 'access' })).toString('base64url');
    expect(() => verifyAccessToken(`${header}.${forged}.${signature}`)).toThrow(UnauthorizedError);
  });

  it('rejects an expired token', () => {
    const jwt = require('jsonwebtoken');
    const expired = jwt.sign(
      { role: 'STUDENT', classId: null, type: 'access' },
      process.env.JWT_SECRET,
      {
        algorithm: 'HS256',
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        subject: 'user-1',
        expiresIn: '-1s',
      },
    );
    expect(() => verifyAccessToken(expired)).toThrow('Token kedaluwarsa');
  });

  it('rejects a token with the wrong audience', () => {
    const jwt = require('jsonwebtoken');
    const wrongAudience = jwt.sign({ role: 'STUDENT', type: 'access' }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      issuer: process.env.JWT_ISSUER,
      audience: 'someone-else',
      subject: 'user-1',
    });
    expect(() => verifyAccessToken(wrongAudience)).toThrow(UnauthorizedError);
  });

  it('rejects a non-access token type', () => {
    const jwt = require('jsonwebtoken');
    const wrongType = jwt.sign({ role: 'STUDENT', type: 'refresh' }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
      subject: 'user-1',
    });
    expect(() => verifyAccessToken(wrongType)).toThrow(UnauthorizedError);
  });

  it('reports the TTL in seconds', () => {
    expect(accessTokenTtlSeconds()).toBe(900);
  });
});

describe('hybrid logical clock', () => {
  it('parses a formatted clock', () => {
    const formatted = formatHlc({ millis: 1234, counter: 7, nodeId: 'node-1' });
    expect(parseHlc(formatted)).toEqual({ millis: 1234, counter: 7, nodeId: 'node-1' });
    expect(isValidHlc(formatted)).toBe(true);
    expect(isValidHlc('garbage')).toBe(false);
  });

  it('is monotonic across a clock skew', () => {
    const first = tickHlc(null, 'n1', 10_000);
    const second = tickHlc(first, 'n1', 5_000);
    expect(compareHlc(second, first)).toBe(1);
  });

  it('merges concurrent remote events', () => {
    const local = tickHlc(null, 'n1', 1_000);
    const remote = tickHlc(null, 'n2', 1_000);
    const merged = receiveHlc(local, remote, 'n1', 1_000);
    expect(compareHlc(merged, local)).toBe(1);
    expect(compareHlc(merged, remote)).toBe(1);
  });

  it('falls back safely on malformed input', () => {
    expect(compareHlc('a', 'b')).toBe(-1);
    expect(tickHlc('nonsense', 'n1', 42)).toContain('n1');
    expect(receiveHlc('nonsense', 'also-nonsense', 'n1', 42)).toContain('n1');
  });
});

describe('merge edge cases', () => {
  it('applies the first write to an empty clock map', () => {
    const result = mergeFields({}, {}, { title: 'A' }, formatHlc({ millis: 1, counter: 0, nodeId: 'n' }));
    expect(result.merged).toEqual({ title: 'A' });
    expect(result.appliedFields).toEqual(['title']);
  });

  it('keeps the local value on a tie', () => {
    const clock = formatHlc({ millis: 5, counter: 0, nodeId: 'n' });
    const result = mergeFields({ title: 'lokal' }, { title: clock }, { title: 'remote' }, clock);
    expect(result.merged.title).toBe('lokal');
    expect(result.rejectedFields).toEqual(['title']);
  });

  it('prefers the higher node id on an identical timestamp', () => {
    const low = formatHlc({ millis: 5, counter: 0, nodeId: 'a' });
    const high = formatHlc({ millis: 5, counter: 0, nodeId: 'b' });
    const result = mergeFields({ title: 'a' }, { title: low }, { title: 'b' }, high);
    expect(result.merged.title).toBe('b');
  });
});
