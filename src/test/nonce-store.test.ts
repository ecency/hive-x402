import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SqliteNonceStore } from "../facilitator/store/nonce-store.js";

describe("SqliteNonceStore", () => {
  it("reports unspent nonce as not spent", () => {
    const store = new SqliteNonceStore(":memory:");
    assert.equal(store.isSpent("nonce1"), false);
  });

  it("reports spent nonce as spent after markSpent", () => {
    const store = new SqliteNonceStore(":memory:");
    store.markSpent("nonce1");
    assert.equal(store.isSpent("nonce1"), true);
  });

  it("handles multiple nonces independently", () => {
    const store = new SqliteNonceStore(":memory:");
    store.markSpent("a");
    assert.equal(store.isSpent("a"), true);
    assert.equal(store.isSpent("b"), false);
    store.markSpent("b");
    assert.equal(store.isSpent("b"), true);
  });

  it("markSpent is idempotent (INSERT OR IGNORE)", () => {
    const store = new SqliteNonceStore(":memory:");
    store.markSpent("x");
    store.markSpent("x"); // should not throw
    assert.equal(store.isSpent("x"), true);
  });
});
