import type { Role } from '../domain/enums';

/** Authenticated principal attached by `authenticate`. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  classId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      /** Correlation id, generated per request (never trusted from the client). */
      id: string;
      user?: AuthUser;
    }
  }
}

export {};
