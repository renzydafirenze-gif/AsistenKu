import type { PushToken } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { writeAudit } from '../../lib/audit';
import type { NotificationChannel } from '../../domain/enums';

/**
 * Device token lifecycle.
 *
 * Invariants:
 *  - a token is unique across the whole system; registering a token that is
 *    already attached to another account transfers ownership (shared/sold
 *    devices must never notify the previous user);
 *  - revoked tokens are revived rather than duplicated, so the unique index
 *    stays a hard guarantee and dedupe holds at the database level.
 */
export async function registerPushToken(
  userId: string,
  token: string,
  platform: NotificationChannel,
): Promise<PushToken> {
  const existing = await prisma.pushToken.findUnique({ where: { token } });

  if (!existing) {
    return prisma.pushToken.create({ data: { userId, token, platform } });
  }

  if (existing.userId !== userId) {
    await writeAudit({
      actorId: userId,
      action: 'push_token.transfer',
      entityType: 'PushToken',
      entityId: existing.id,
      metadata: { fromUserId: existing.userId, platform },
    });
  }

  return prisma.pushToken.update({
    where: { id: existing.id },
    data: { userId, platform, revokedAt: null, lastSeenAt: new Date() },
  });
}

export async function revokePushToken(userId: string, token: string): Promise<boolean> {
  const result = await prisma.pushToken.updateMany({
    where: { userId, token, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

export async function activeTokensFor(userId: string): Promise<PushToken[]> {
  return prisma.pushToken.findMany({ where: { userId, revokedAt: null } });
}
