import { createHash } from 'crypto';

/** Refresh tokens are stored as a hash only - never the raw value. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
