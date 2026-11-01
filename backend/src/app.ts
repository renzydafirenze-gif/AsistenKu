import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { corsOrigins, env, isProd, isTest } from './config/env';
import { requestContext } from './middleware/requestContext';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { createRateLimiter } from './middleware/rateLimit';
import { AuthService } from './modules/auth/auth.service';
import { lazyGoogleVerifier, type GoogleTokenVerifier } from './modules/auth/google';
import { createAuthRouter } from './modules/auth/auth.routes';
import { createDutyRouter } from './modules/duty/duty.routes';
import { createUniformRouter } from './modules/uniform/uniform.routes';
import { createHomeworkRouter } from './modules/homework/homework.routes';
import { createExamRouter } from './modules/exam/exam.routes';
import { createSubjectRouter } from './modules/subject/subject.routes';
import { createSyncRouter } from './modules/sync/sync.routes';
import { createNotificationRouter } from './modules/notifications/notification.routes';
import {
  buildPushProviders,
  NotificationService,
} from './modules/notifications/notification.service';
import { createUserRouter } from './modules/users/user.routes';
import { createDashboardRouter } from './modules/dashboard/dashboard.routes';
import type { Clock } from './modules/notifications/types';
import { systemClock } from './modules/notifications/types';

export interface AppDependencies {
  googleVerifier?: GoogleTokenVerifier;
  notificationService?: NotificationService;
  clock?: Clock;
  /** Disable rate limiting in latency benchmarks. */
  enableRateLimit?: boolean;
  /** Override limiter options (tests use a small limit). */
  rateLimitOptions?: Partial<Parameters<typeof createRateLimiter>[0]>;
}

/**
 * Builds the Express application.
 *
 * Dependencies are injected so tests can swap the Google verifier, the push
 * providers and the clock without monkey-patching modules.
 */
export function createApp(dependencies: AppDependencies = {}): Application {
  const clock = dependencies.clock ?? systemClock;
  const app = express();

  // Behind the EKS load balancer; needed for correct client IPs in rate limiting.
  if (env.TRUST_PROXY) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestContext);
  app.use(
    helmet({
      contentSecurityPolicy: false, // API only; the mobile app renders the UI.
      hsts: isProd ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(
    cors({
      origin: corsOrigins.includes('*') ? true : corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      maxAge: 600,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

  // TLS is terminated at the load balancer; refuse plaintext in production so a
  // misconfigured ingress cannot serve authenticated traffic over HTTP.
  if (isProd) {
    app.use((req, res, next) => {
      const proto = req.headers['x-forwarded-proto'];
      if (proto && proto !== 'https') {
        res.status(403).json({
          error: { code: 'TLS_REQUIRED', message: 'HTTPS diperlukan', requestId: req.id },
        });
        return;
      }
      next();
    });
  }

  if (dependencies.enableRateLimit !== false) app.use(createRateLimiter(dependencies.rateLimitOptions ?? {}));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', env: env.NODE_ENV, time: clock.now().toISOString() });
  });

  app.get('/health/ready', (_req, res) => {
    res.json({ status: 'ready' });
  });

  const notificationService =
    dependencies.notificationService ?? new NotificationService(buildPushProviders(), clock);
  const authService = new AuthService(dependencies.googleVerifier ?? lazyGoogleVerifier());

  const api = express.Router();
  api.use(
    '/auth',
    createAuthRouter(authService, { enableRateLimit: dependencies.enableRateLimit !== false }),
  );
  api.use('/users', createUserRouter());
  api.use('/dashboard', createDashboardRouter(clock));
  api.use('/duties', createDutyRouter());
  api.use('/uniform', createUniformRouter());
  api.use('/homework', createHomeworkRouter());
  api.use('/exams', createExamRouter());
  api.use('/subjects', createSubjectRouter());
  api.use('/sync', createSyncRouter());
  api.use('/notifications', createNotificationRouter(notificationService));

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  // Exposed for tests that assert wiring without a network hop.
  app.locals.notificationService = notificationService;
  app.locals.authService = authService;

  if (isTest) app.locals.env = env;
  return app;
}
