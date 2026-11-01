import crypto from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from './errors';
import type { Role } from '../domain/enums';

export interface AccessTokenPayload extends JwtPayload {
  sub: string;
  role: Role;
  classId: string | null;
  type: 'access';
}

export interface AccessTokenSubject {
  id: string;
  role: Role;
  classId: string | null;
}

export function signAccessToken(subject: AccessTokenSubject): { token: string; expiresIn: string } {
  const options: SignOptions = {
    algorithm: 'HS256',
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    subject: subject.id,
    jwtid: crypto.randomUUID(),
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
  };
  const token = jwt.sign({ role: subject.role, classId: subject.classId, type: 'access' }, env.JWT_SECRET, options);
  return { token, expiresIn: env.ACCESS_TOKEN_TTL };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      // Algorithm is pinned: prevents `alg: none` and RS/HS confusion attacks.
      algorithms: ['HS256'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    if (typeof decoded === 'string') throw new UnauthorizedError('Token tidak valid');
    const payload = decoded as AccessTokenPayload;
    if (payload.type !== 'access' || !payload.sub) {
      throw new UnauthorizedError('Token tidak valid');
    }
    return payload;
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    const reason = error instanceof Error && error.name === 'TokenExpiredError' ? 'Token kedaluwarsa' : 'Token tidak valid';
    throw new UnauthorizedError(reason);
  }
}

export function accessTokenTtlSeconds(): number {
  const match = /^(\d+)([smhd])$/.exec(env.ACCESS_TOKEN_TTL);
  if (!match) return 900;
  const value = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return value * multiplier;
}
