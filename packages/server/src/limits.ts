// Per-connection limits and transport constants (docs/PROTOCOL.md).

/** Max WebSocket message size: larger frames are closed with 1009 by the ws library. */
export const MAX_FRAME_BYTES = 64 * 1024;

/** Server pings this often. */
export const PING_INTERVAL_MS = 20_000;
/** A connection that has not ponged for this long is closed (seat stays reserved). */
export const PONG_TIMEOUT_MS = 60_000;

/** Max messages per second per connection; excess gets RATE_LIMIT errors. */
export const RATE_LIMIT_PER_SECOND = 20;
/** This many excess messages in a row closes the connection (code 1008). */
export const RATE_LIMIT_CLOSE_AFTER = 100;

export type RateVerdict = 'ok' | 'limited' | 'close';

/**
 * Fixed-window per-second counter. Call once per received message:
 * - 'ok'      -> within the limit
 * - 'limited' -> over the limit, reply RATE_LIMIT and drop the message
 * - 'close'   -> RATE_LIMIT_CLOSE_AFTER excess messages in a row, close the connection
 */
export class RateLimiter {
  private windowStart = 0;
  private count = 0;
  private excessStreak = 0;

  constructor(private readonly maxPerSecond = RATE_LIMIT_PER_SECOND) {}

  record(now = Date.now()): RateVerdict {
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      this.count = 0;
    }
    this.count++;
    if (this.count > this.maxPerSecond) {
      this.excessStreak++;
      return this.excessStreak >= RATE_LIMIT_CLOSE_AFTER ? 'close' : 'limited';
    }
    this.excessStreak = 0;
    return 'ok';
  }
}
