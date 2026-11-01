import { logger } from '../../../lib/logger';
import type { PushMessage, PushProvider, PushResult } from '../types';

/**
 * No-op provider used in development, CI and whenever credentials are absent.
 * It still returns the exact `PushResult` shape so the surrounding dedupe,
 * logging and retry logic is exercised by tests.
 */
export class DryRunPushProvider implements PushProvider {
  constructor(readonly channel: 'FCM' | 'APNS') {}

  async send(message: PushMessage): Promise<PushResult> {
    logger.debug({ channel: this.channel, token: message.token.slice(0, 8), title: message.title }, 'push dry-run');
    return { ok: true };
  }
}

/** Deterministic provider for tests: records every send and can be scripted. */
export class RecordingPushProvider implements PushProvider {
  readonly sent: PushMessage[] = [];

  constructor(
    readonly channel: 'FCM' | 'APNS',
    private readonly result: PushResult = { ok: true },
  ) {}

  async send(message: PushMessage): Promise<PushResult> {
    this.sent.push(message);
    return this.result;
  }
}
