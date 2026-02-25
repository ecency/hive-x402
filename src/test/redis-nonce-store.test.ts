import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RedisNonceStore, type RedisLike } from "../facilitator/store/redis-nonce-store.js";

/** In-memory mock that mimics Redis get/set with EX TTL */
function createMockRedis(): RedisLike & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string, ..._args: unknown[]) {
      store.set(key, value);
      return "OK";
    },
  };
}

describe("RedisNonceStore", () => {
  it("reports unspent nonce as not spent", async () => {
    const redis = createMockRedis();
    const store = new RedisNonceStore({ client: redis });
    assert.equal(await store.isSpent("nonce1"), false);
  });

  it("reports spent nonce as spent after markSpent", async () => {
    const redis = createMockRedis();
    const store = new RedisNonceStore({ client: redis });
    await store.markSpent("nonce1");
    assert.equal(await store.isSpent("nonce1"), true);
  });

  it("uses correct key prefix", async () => {
    const redis = createMockRedis();
    const store = new RedisNonceStore({ client: redis, prefix: "custom:" });
    await store.markSpent("abc");
    assert.ok(redis.store.has("custom:abc"));
    assert.ok(!redis.store.has("x402:nonce:abc"));
  });

  it("uses default x402:nonce: prefix", async () => {
    const redis = createMockRedis();
    const store = new RedisNonceStore({ client: redis });
    await store.markSpent("abc");
    assert.ok(redis.store.has("x402:nonce:abc"));
  });

  it("handles multiple nonces independently", async () => {
    const redis = createMockRedis();
    const store = new RedisNonceStore({ client: redis });
    await store.markSpent("a");
    assert.equal(await store.isSpent("a"), true);
    assert.equal(await store.isSpent("b"), false);
  });
});
