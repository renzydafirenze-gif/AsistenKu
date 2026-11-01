import { createApp, type AppDependencies } from '../../src/app';
import type { Application } from 'express';

/** App instance with rate limiting off by default (dedicated tests enable it). */
export function makeApp(deps: AppDependencies = {}): Application {
  return createApp({ enableRateLimit: false, ...deps });
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export function fixedClock(iso: string) {
  const now = new Date(iso);
  return { now: () => new Date(now.getTime()) };
}
