import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { logger } from './logger';

export interface AuditInput {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

type AuditClient = Pick<Prisma.TransactionClient, 'auditLog'>;

/**
 * Append-only audit trail for security-relevant events (denied mutations,
 * grading, publishing, completion, auth events).
 *
 * Audit failures must never mask the original outcome, so they are logged and
 * swallowed. Writes can be routed through a transaction client when the audit
 * entry has to be atomic with the mutation it describes.
 */
export async function writeAudit(input: AuditInput, client: AuditClient = prisma): Promise<void> {
  try {
    await client.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: JSON.stringify(input.metadata ?? {}),
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 512) ?? null,
      },
    });
  } catch (error) {
    logger.error({ err: error, action: input.action }, 'failed to write audit log');
  }
}

export function auditFromRequest(
  req: { user?: { id: string; role: string }; ip?: string; headers: Record<string, unknown> },
  data: Omit<AuditInput, 'actorId' | 'actorRole' | 'ip' | 'userAgent'>,
): AuditInput {
  return {
    ...data,
    actorId: req.user?.id ?? null,
    actorRole: req.user?.role ?? null,
    ip: req.ip ?? null,
    userAgent: typeof req.headers['user-agent'] === 'string' ? (req.headers['user-agent'] as string) : null,
  };
}