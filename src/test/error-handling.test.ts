import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import express from "express";
import { createFacilitator } from "../facilitator/index.js";
import { paywall } from "../middleware/express.js";
import { HEADER_PAYMENT, type NonceStore } from "../types.js";

class MemoryNonceStore implements NonceStore {
  private spent = new Set<string>();
  isSpent(nonce: string) { return this.spent.has(nonce); }
  markSpent(nonce: string) { this.spent.add(nonce); }
}

describe("Error handling: facilitator", () => {
  let server: Server;
  let port: number;

  before(async () => {
    const app = createFacilitator({
      nonceStore: new MemoryNonceStore(),
      rateLimit: { max: 5, windowMs: 60_000 },
    });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    port = (server.address() as any).port;
  });

  after(() => server?.close());

  it("rejects oversized body (> 64kb)", async () => {
    const bigBody = JSON.stringify({ data: "x".repeat(100_000) });
    const res = await fetch(`http://localhost:${port}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bigBody,
    });
    assert.equal(res.status, 413);
  });

  it("returns 400 for missing fields on /verify", async () => {
    const res = await fetch(`http://localhost:${port}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  it("returns 400 for missing fields on /settle", async () => {
    const res = await fetch(`http://localhost:${port}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  it("rate limits after max requests", async () => {
    // Use 5 requests (the limit), then the 6th should be 429
    const results = [];
    for (let i = 0; i < 7; i++) {
      const res = await fetch(`http://localhost:${port}/health`);
      results.push(res.status);
    }
    // At least one should be 429 (the rate limit was already partially consumed above)
    assert.ok(results.includes(429), `Expected at least one 429, got: ${results}`);
  });

  it("returns rate limit headers", async () => {
    // New server with fresh rate limit state
    const app2 = createFacilitator({
      nonceStore: new MemoryNonceStore(),
      rateLimit: { max: 100, windowMs: 60_000 },
    });
    const s2 = await new Promise<Server>((resolve) => {
      const s = app2.listen(0, () => resolve(s));
    });
    const p2 = (s2.address() as any).port;

    const res = await fetch(`http://localhost:${p2}/health`);
    assert.ok(res.headers.get("x-ratelimit-limit"));
    assert.ok(res.headers.get("x-ratelimit-remaining"));
    assert.ok(res.headers.get("x-ratelimit-reset"));
    s2.close();
  });
});

describe("Error handling: middleware", () => {
  let server: Server;
  let port: number;

  before(async () => {
    const app = express();
    app.get(
      "/api/test",
      paywall({
        amount: "0.050 HBD",
        receivingAccount: "bob",
        facilitatorUrl: "http://localhost:1", // intentionally unreachable
      }),
      (_req, res) => res.json({ ok: true })
    );
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    port = (server.address() as any).port;
  });

  after(() => server?.close());

  it("returns 400 for malformed base64 payment header", async () => {
    const res = await fetch(`http://localhost:${port}/api/test`, {
      headers: { [HEADER_PAYMENT]: "not-valid-base64-json!!!" },
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /Malformed/);
  });

  it("returns 500 when facilitator is unreachable", async () => {
    // Valid base64 JSON but facilitator is not running on port 1
    const validPayload = Buffer.from(JSON.stringify({
      x402Version: 1,
      scheme: "exact",
      network: "hive:mainnet",
      payload: {
        signedTransaction: {
          ref_block_num: 1, ref_block_prefix: 2, expiration: "2030-01-01T00:00:00",
          operations: [], extensions: [], signatures: [],
        },
        nonce: "test",
      },
    })).toString("base64");

    const res = await fetch(`http://localhost:${port}/api/test`, {
      headers: { [HEADER_PAYMENT]: validPayload },
    });
    assert.equal(res.status, 500);
    const data = await res.json();
    assert.match(data.error, /Payment processing error/);
  });
});
