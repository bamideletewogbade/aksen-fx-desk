/**
 * Edge resilience primitives: Rate Limiter, Circuit Breaker, and Hash utility.
 */

export class Breaker {
  readonly name: string;
  private readonly opts: { failures: number; firstPauseMs: number; maxPauseMs: number; noCreditPauseMs: number };
  private failures = 0;
  private pauseMs: number;
  private openUntil = 0;
  private trial = false;

  constructor(name: string, opts = { failures: 3, firstPauseMs: 60_000, maxPauseMs: 600_000, noCreditPauseMs: 1_800_000 }) {
    this.name = name;
    this.opts = opts;
    this.pauseMs = opts.firstPauseMs;
  }

  mayCall(now: number): boolean {
    if (this.openUntil > now) return false;
    if (this.failures >= this.opts.failures) {
      if (this.trial) return false;
      this.trial = true;
    }
    return true;
  }

  succeeded(): void {
    this.failures = 0;
    this.pauseMs = this.opts.firstPauseMs;
    this.openUntil = 0;
    this.trial = false;
  }

  failed(now: number, noCredit = false): void {
    this.trial = false;
    this.failures += 1;
    if (noCredit) {
      this.openUntil = now + this.opts.noCreditPauseMs;
      this.failures = Math.max(this.failures, this.opts.failures);
      return;
    }
    if (this.failures >= this.opts.failures) {
      this.openUntil = now + this.pauseMs;
      this.pauseMs = Math.min(this.pauseMs * 2, this.opts.maxPauseMs);
    }
  }

  isOpen(now: number): boolean {
    return this.openUntil > now;
  }
}

export class Limiter {
  private buckets = new Map<string, { tokens: number; at: number }>();
  private readonly burst: number;
  private readonly refillMs: number;
  private readonly maxClients: number;

  constructor(burst: number, refillMs: number, maxClients = 5_000) {
    this.burst = burst;
    this.refillMs = refillMs;
    this.maxClients = maxClients;
  }

  allow(client: string, now: number): boolean {
    const bucket = this.buckets.get(client) ?? { tokens: this.burst, at: now };
    let { tokens, at } = bucket;
    const earned = Math.floor((now - at) / this.refillMs);
    if (earned > 0) {
      tokens = Math.min(this.burst, tokens + earned);
      at += earned * this.refillMs;
    }
    if (tokens >= this.burst) at = now;
    this.buckets.delete(client);
    const ok = tokens > 0;
    this.buckets.set(client, { tokens: ok ? tokens - 1 : 0, at });
    while (this.buckets.size > this.maxClients) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
    return ok;
  }
}

export function hashOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
