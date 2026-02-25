import type { NonceStore } from "../../types.js";

/**
 * Generic Redis client interface — compatible with `ioredis` and `redis` (node-redis).
 * Consumers pass their own Redis client instance.
 */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
}

export interface RedisNonceStoreOptions {
  /** Redis client instance (ioredis or node-redis compatible) */
  client: RedisLike;
  /** Key prefix for nonce entries. Default: "x402:nonce:" */
  prefix?: string;
  /** TTL in seconds for spent nonces. Default: 86400 (24 hours) */
  ttlSeconds?: number;
}

/**
 * Redis-backed nonce store with TTL-based expiration.
 * Production-grade alternative to SqliteNonceStore.
 */
export class RedisNonceStore implements NonceStore {
  private client: RedisLike;
  private prefix: string;
  private ttl: number;

  constructor(options: RedisNonceStoreOptions) {
    this.client = options.client;
    this.prefix = options.prefix ?? "x402:nonce:";
    this.ttl = options.ttlSeconds ?? 86400;
  }

  async isSpent(nonce: string): Promise<boolean> {
    const val = await this.client.get(this.prefix + nonce);
    return val !== null;
  }

  async markSpent(nonce: string): Promise<void> {
    await this.client.set(this.prefix + nonce, "1", "EX", this.ttl);
  }
}
