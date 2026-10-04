export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
}

const DEFAULT_BACKOFF_BASE_MS = 1_000;
const DEFAULT_BACKOFF_MAX_MS = 30_000;
const BACKOFF_FACTOR = 2;

/** Espera antes del intento `attempt` (desde 0): base * 2^attempt, con tope. */
export const exponentialBackoffMs = (attempt: number, options: BackoffOptions = {}): number => {
  const { baseMs = DEFAULT_BACKOFF_BASE_MS, maxMs = DEFAULT_BACKOFF_MAX_MS } = options;
  return Math.min(maxMs, baseMs * BACKOFF_FACTOR ** attempt);
};
