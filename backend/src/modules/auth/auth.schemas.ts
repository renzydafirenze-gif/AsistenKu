import { z } from 'zod';
import { NOTIFICATION_CHANNELS, ROLES } from '../../domain/enums';
import { isStrongEnough, PASSWORD_MIN_LENGTH } from '../../lib/password';

export const emailSchema = z.string().trim().toLowerCase().email('Format email tidak valid').max(254);
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password minimal ${PASSWORD_MIN_LENGTH} karakter`)
  .max(128)
  .refine(isStrongEnough, 'Password harus memuat huruf dan angka');

export const roleSchema = z.enum(ROLES);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(1).max(120),
  role: roleSchema.default('STUDENT'),
  classId: z.string().uuid().nullish(),
  phone: z.string().trim().max(32).optional(),
  address: z.string().trim().max(512).optional(),
  inviteCode: z.string().max(128).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const googleSignInSchema = z.object({
  idToken: z.string().min(16).max(8192),
  role: roleSchema.default('STUDENT'),
  classId: z.string().uuid().nullish(),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(16).max(512) });

export const pushTokenSchema = z.object({
  token: z.string().trim().min(16).max(4096),
  platform: z.enum(NOTIFICATION_CHANNELS),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleSignInInput = z.infer<typeof googleSignInSchema>;