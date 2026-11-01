import type { NotificationChannel } from '../../domain/enums';

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface PushResult {
  ok: boolean;
  /** Provider error code/message; stored on NotificationLog for observability. */
  error?: string;
  /** True when the token is permanently invalid and should be revoked. */
  tokenInvalid?: boolean;
}

export interface PushProvider {
  readonly channel: NotificationChannel;
  send(message: PushMessage): Promise<PushResult>;
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
