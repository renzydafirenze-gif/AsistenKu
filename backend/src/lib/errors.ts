/** Typed HTTP errors. Every failure path maps to one of these. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(
    status: number,
    code: string,
    message: string,
    options: { details?: unknown; expose?: boolean; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = options.details;
    this.expose = options.expose ?? status < 500;
    if (options.cause !== undefined) this.cause = options.cause;
    Error.captureStackTrace?.(this, AppError);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Permintaan tidak valid', details?: unknown) {
    super(400, 'BAD_REQUEST', message, { details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Autentikasi diperlukan') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Tidak memiliki akses', details?: unknown) {
    super(403, 'FORBIDDEN', message, { details });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Data tidak ditemukan') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Data bertentangan', details?: unknown) {
    super(409, 'CONFLICT', message, { details });
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Payload terlalu besar') {
    super(413, 'PAYLOAD_TOO_LARGE', message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Terlalu banyak permintaan') {
    super(429, 'TOO_MANY_REQUESTS', message);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Layanan tidak tersedia', cause?: unknown) {
    super(503, 'SERVICE_UNAVAILABLE', message, { cause });
  }
}
