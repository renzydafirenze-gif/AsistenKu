/**
 * Prisma error guards.
 *
 * These are duck-typed on purpose: the production PostgreSQL client and the
 * SQLite mirror used by the test suite are separate generated classes, so
 * `instanceof Prisma.PrismaClientKnownRequestError` only matches one of them.
 * Checking the documented `code` property works for both.
 */
const KNOWN_CODES = new Set([
  'P2000',
  'P2001',
  'P2002',
  'P2003',
  'P2004',
  'P2005',
  'P2006',
  'P2007',
  'P2008',
  'P2009',
  'P2010',
  'P2011',
  'P2012',
  'P2013',
  'P2014',
  'P2015',
  'P2016',
  'P2017',
  'P2018',
  'P2019',
  'P2020',
  'P2021',
  'P2022',
  'P2023',
  'P2024',
  'P2025',
  'P2026',
  'P2027',
  'P2028',
  'P2030',
  'P2031',
  'P2033',
  'P2034',
]);

export interface PrismaLikeError {
  name: string;
  code?: string;
  meta?: unknown;
  message: string;
}

export function isKnownRequestError(error: unknown): error is PrismaLikeError {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { name?: unknown; code?: unknown };
  return candidate.name === 'PrismaClientKnownRequestError' && typeof candidate.code === 'string' && KNOWN_CODES.has(candidate.code);
}

export function isValidationError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'PrismaClientValidationError'
  );
}

export function isUniqueViolation(error: unknown): boolean {
  return isKnownRequestError(error) && error.code === 'P2002';
}

export function isNotFound(error: unknown): boolean {
  return isKnownRequestError(error) && error.code === 'P2025';
}
