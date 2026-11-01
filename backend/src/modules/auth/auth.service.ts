import { prisma } from '../../db/prisma';
import { env } from '../../config/env';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../lib/errors';
import { burnPasswordComparison, hashPassword, verifyPassword } from '../../lib/password';
import { signAccessToken, accessTokenTtlSeconds } from '../../lib/jwt';
import { hashToken, randomToken, safeEqual } from '../../lib/fieldCrypto';
import { decryptOptional, encryptOptional } from '../../lib/fieldCrypto';
import { logger } from '../../lib/logger';
import type { Role } from '../../domain/enums';
import type { GoogleTokenVerifier } from './google';
import type { GoogleSignInInput, LoginInput, RegisterInput } from './auth.schemas';
import type { User } from '@prisma/client';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  classId: string | null;
  phone: string | null;
  address: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as Role,
    classId: user.classId,
    phone: decryptOptional(user.phoneEnc),
    address: decryptOptional(user.addressEnc),
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Staff self-registration is gated: roles that can author content need an invite. */
function assertRoleAllowed(role: Role, inviteCode?: string): void {
  if (role === 'STUDENT' || role === 'PARENT') return;
  const expected = env.STAFF_INVITE_CODE;
  if (!expected) {
    throw new ForbiddenError('Pendaftaran peran staf dinonaktifkan; hubungi administrator sekolah');
  }
  if (!inviteCode || !safeEqual(inviteCode, expected)) {
    throw new ForbiddenError('Kode undangan staf tidak valid');
  }
}

export class AuthService {
  constructor(private readonly googleVerifier: GoogleTokenVerifier) {}

  async register(input: RegisterInput, context: TokenContext = {}): Promise<AuthResult> {
    assertRoleAllowed(input.role, input.inviteCode);

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictError('Email sudah terdaftar');

    if (input.classId) {
      const schoolClass = await prisma.schoolClass.findUnique({ where: { id: input.classId } });
      if (!schoolClass) throw new BadRequestError('Kelas tidak ditemukan');
      // Students and staff are scoped to a class; parents follow their children.
      if (input.role === 'PARENT') throw new BadRequestError('Akun orang tua tidak terikat ke satu kelas');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        role: input.role,
        classId: input.classId ?? null,
        phoneEnc: encryptOptional(input.phone),
        addressEnc: encryptOptional(input.address),
      },
    });

    return this.issueSession(user, context);
  }

  async login(input: LoginInput, context: TokenContext = {}): Promise<AuthResult> {
    const user = await prisma.user.findFirst({ where: { email: input.email, deletedAt: null } });

    if (!user || !user.passwordHash) {
      // Constant-ish time: always do a hash comparison so the response time does
      // not disclose whether the account exists.
      await burnPasswordComparison(input.password);
      throw new UnauthorizedError('Email atau password salah');
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Email atau password salah');
    if (!user.isActive) throw new ForbiddenError('Akun dinonaktifkan');

    return this.issueSession(user, context);
  }

  async signInWithGoogle(input: GoogleSignInInput, context: TokenContext = {}): Promise<AuthResult> {
    const identity = await this.googleVerifier.verify(input.idToken);
    if (!identity.emailVerified) {
      throw new UnauthorizedError('Email Google belum diverifikasi');
    }

    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId: identity.sub }, { email: identity.email }], deletedAt: null },
    });

    if (user) {
      if (!user.googleId) {
        user = await prisma.user.update({ where: { id: user.id }, data: { googleId: identity.sub } });
      }
      if (!user.isActive) throw new ForbiddenError('Akun dinonaktifkan');
      return this.issueSession(user, context);
    }

    assertRoleAllowed(input.role);
    if (input.classId) {
      const schoolClass = await prisma.schoolClass.findUnique({ where: { id: input.classId } });
      if (!schoolClass) throw new BadRequestError('Kelas tidak ditemukan');
    }

    user = await prisma.user.create({
      data: {
        email: identity.email,
        googleId: identity.sub,
        fullName: identity.name ?? identity.email.split('@')[0]!,
        role: input.role,
        classId: input.classId ?? null,
        avatarUrl: identity.picture ?? null,
      },
    });
    return this.issueSession(user, context);
  }

  /**
   * Refresh-token rotation: the presented token is revoked and replaced. Reuse of
   * an already-rotated token revokes the whole family (theft detection).
   */
  async refresh(presentedToken: string, context: TokenContext = {}): Promise<AuthResult> {
    const tokenHash = hashToken(presentedToken);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored) throw new UnauthorizedError('Refresh token tidak valid');
    if (stored.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      logger.warn({ userId: stored.userId }, 'refresh token reuse detected; family revoked');
      throw new UnauthorizedError('Refresh token sudah digunakan');
    }
    if (stored.expiresAt.getTime() <= Date.now()) throw new UnauthorizedError('Refresh token kedaluwarsa');

    const user = await prisma.user.findFirst({ where: { id: stored.userId, deletedAt: null } });
    if (!user || !user.isActive) throw new UnauthorizedError('Akun tidak aktif');

    const next = await this.createRefreshToken(user.id, context);
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: next.id },
    });

    const access = signAccessToken({ id: user.id, role: user.role as Role, classId: user.classId });
    return {
      user: toPublicUser(user),
      tokens: {
        accessToken: access.token,
        refreshToken: next.token,
        expiresIn: accessTokenTtlSeconds(),
        tokenType: 'Bearer',
      },
    };
  }

  async logout(presentedToken: string): Promise<void> {
    const tokenHash = hashToken(presentedToken);
    await prisma.refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async logoutAll(userId: string): Promise<number> {
    const result = await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /**
   * Password change. Revokes every refresh token: a stolen session must not
   * survive a credential rotation.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundError('Pengguna tidak ditemukan');
    if (!user.passwordHash) throw new BadRequestError('Akun ini masuk melalui Google, atur kata sandi terlebih dahulu');
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new UnauthorizedError('Kata sandi saat ini salah');
    }
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
    await this.logoutAll(userId);
  }

  async me(userId: string): Promise<PublicUser> {    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundError('Pengguna tidak ditemukan');
    return toPublicUser(user);
  }

  private async issueSession(user: User, context: TokenContext): Promise<AuthResult> {
    const access = signAccessToken({ id: user.id, role: user.role as Role, classId: user.classId });
    const refresh = await this.createRefreshToken(user.id, context);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return {
      user: toPublicUser(user),
      tokens: {
        accessToken: access.token,
        refreshToken: refresh.token,
        expiresIn: accessTokenTtlSeconds(),
        tokenType: 'Bearer',
      },
    };
  }

  private async createRefreshToken(
    userId: string,
    context: TokenContext,
  ): Promise<{ id: string; token: string }> {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    const record = await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt,
        userAgent: context.userAgent?.slice(0, 512),
        ip: context.ip,
      },
    });
    return { id: record.id, token };
  }
}

export interface TokenContext {
  ip?: string;
  userAgent?: string;
}
