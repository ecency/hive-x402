import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrivateKey, cryptoUtils } from "@hiveio/dhive";
import type { Client, SignedTransaction, TransactionConfirmation, Operation } from "@hiveio/dhive";
import type { Server } from "node:http";
import { randomBytes } from "node:crypto";

import { createFacilitator } from "../facilitator/index.js";
import { paywall } from "../middleware/express.js";
import {
  HIVE_CHAIN_ID,
  X402_VERSION,
  HIVE_NETWORK,
  encodePayment,
  decodePaymentRequired,
  getRequiredAmount,
  type PaymentPayloadV1,
  type NonceStore,
  type PricingContext,
} from "../types.js";
import type { Request } from "express";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TEST_SENDER = "alice";
const TEST_RECEIVER = "bob";
const TEST_PRIVKEY = PrivateKey.fromSeed("test-dynamic-pricing");
const TEST_PUBKEY = TEST_PRIVKEY.createPublic().toString();

class MemoryNonceStore implements NonceStore {
  private spent = new Set<string>();
  isSpent(nonce: string) { return this.spent.has(nonce); }
  markSpent(nonce: string) { this.spent.add(nonce); }
}

function createMockHiveClient(): Client {
  return {
    database: {
      getAccounts(names: string[]) {
        return Promise.resolve(
          names.map((name) => ({
            name,
            active: { weight_threshold: 1, account_auths: [], key_auths: [[TEST_PUBKEY, 1]] },
          }))
        );
      },
    },
    broadcast: {
      send(_tx: SignedTransaction): Promise<TransactionConfirmation> {
        return Promise.resolve({ id: "mock_tx_" + randomBytes(8).toString("hex"), block_num: 99999, trx_num: 0, expired: false });
      },
    },
  } as unknown as Client;
}

function buildSignedPayment(opts: { from?: string; to?: string; amount?: string }) {
  const nonce = randomBytes(16).toString("hex");
  const expiration = new Date(Date.now() + 60_000).toISOString().slice(0, -5);
  const tx = {
    ref_block_num: 1234,
    ref_block_prefix: 5678,
    expiration,
    operations: [
      ["transfer", { from: opts.from ?? TEST_SENDER, to: opts.to ?? TEST_RECEIVER, amount: opts.amount ?? "0.050 HBD", memo: `x402:${nonce}` }] as unknown as Operation,
    ],
    extensions: [],
  };
  const signedTx = cryptoUtils.signTransaction(tx, TEST_PRIVKEY, Buffer.from(HIVE_CHAIN_ID));
  const payload: PaymentPayloadV1 = { x402Version: X402_VERSION as 1, scheme: "exact", network: HIVE_NETWORK, payload: { signedTransaction: signedTx, nonce } };
  return { paymentHeader: encodePayment(payload), nonce, payload };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Dynamic pricing middleware", () => {
  let facilitatorServer: Server;
  let apiServer: Server;
  let facilitatorPort: number;
  let apiPort: number;
  let priceCallCount: number;
  let setMutablePrice: (p: string) => void;

  before(async () => {
    priceCallCount = 0;

    const facilitatorApp = createFacilitator({
      nonceStore: new MemoryNonceStore(),
      hiveClient: createMockHiveClient(),
      enableMetrics: true,
    });
    facilitatorServer = await new Promise<Server>((resolve) => {
      const s = facilitatorApp.listen(0, () => resolve(s));
    });
    facilitatorPort = (facilitatorServer.address() as any).port;

    const express = (await import("express")).default;
    const apiApp = express();

    // ── Endpoint with price callback ──
    apiApp.get(
      "/api/dynamic",
      paywall({
        amount: ({ raw: req }: PricingContext<Request>) => {
          priceCallCount++;
          const tier = (req.query.tier as string) ?? "basic";
          return tier === "premium" ? "1.000 HBD" : "0.050 HBD";
        },
        receivingAccount: TEST_RECEIVER,
        facilitatorUrl: `http://localhost:${facilitatorPort}`,
      }),
      (req, res) => {
        res.json({ message: "ok", payer: (req as any).payer });
      }
    );

    // ── Endpoint with extra callback ──
    apiApp.get(
      "/api/with-extra",
      paywall({
        amount: "0.050 HBD",
        receivingAccount: TEST_RECEIVER,
        facilitatorUrl: `http://localhost:${facilitatorPort}`,
        extra: ({ raw: req }: PricingContext<Request>) => ({
          model: (req.query.model as string) ?? "default",
        }),
      }),
      (_req, res) => {
        res.json({ message: "ok" });
      }
    );

    // ── Endpoint with static extra ──
    apiApp.get(
      "/api/static-extra",
      paywall({
        amount: "0.050 HBD",
        receivingAccount: TEST_RECEIVER,
        facilitatorUrl: `http://localhost:${facilitatorPort}`,
        extra: { info: "static metadata" },
      }),
      (_req, res) => {
        res.json({ message: "ok" });
      }
    );

    // ── Endpoint with mutable price (simulates time-based pricing) ──
    let mutablePrice = "0.050 HBD";
    apiApp.get(
      "/api/mutable",
      paywall({
        amount: () => mutablePrice,
        receivingAccount: TEST_RECEIVER,
        facilitatorUrl: `http://localhost:${facilitatorPort}`,
      }),
      (req, res) => {
        res.json({ message: "ok", payer: (req as any).payer });
      }
    );

    // Expose setter for tests
    setMutablePrice = (p: string) => { mutablePrice = p; };

    apiServer = await new Promise<Server>((resolve) => {
      const s = apiApp.listen(0, () => resolve(s));
    });
    apiPort = (apiServer.address() as any).port;
  });

  after(async () => {
    await Promise.all([
      facilitatorServer && new Promise(resolve => facilitatorServer.close(resolve)),
      apiServer && new Promise(resolve => apiServer.close(resolve)),
    ]);
  });

  // ── Price callback tests ──────────────────────────────────────────────

  it("402 response uses price from callback (basic tier)", async () => {
    const res = await fetch(`http://localhost:${apiPort}/api/dynamic?tier=basic`);
    assert.equal(res.status, 402);
    const decoded = decodePaymentRequired(res.headers.get("x-payment")!);
    assert.equal(getRequiredAmount(decoded.accepts[0]), "0.050 HBD");
  });

  it("402 response uses price from callback (premium tier)", async () => {
    const res = await fetch(`http://localhost:${apiPort}/api/dynamic?tier=premium`);
    assert.equal(res.status, 402);
    const decoded = decodePaymentRequired(res.headers.get("x-payment")!);
    assert.equal(getRequiredAmount(decoded.accepts[0]), "1.000 HBD");
  });

  it("price callback IS called on paid request path to enforce server price", async () => {
    const before = priceCallCount;

    // First request — 402, callback is called
    await fetch(`http://localhost:${apiPort}/api/dynamic?tier=basic`);
    assert.equal(priceCallCount, before + 1);

    // Second request with payment — callback is called again to verify against server price
    const countBeforePaid = priceCallCount;
    const { paymentHeader } = buildSignedPayment({ amount: "0.050 HBD" });
    await fetch(`http://localhost:${apiPort}/api/dynamic?tier=basic`, {
      headers: { "x-payment": paymentHeader },
    });
    assert.equal(priceCallCount, countBeforePaid + 1, "Price callback should be called to enforce server-side price");
  });

  it("rejects underpayment when price callback returns higher amount", async () => {
    // Client signed for 0.050 HBD but ?tier=premium prices at 1.000 HBD.
    // The server recomputes the price and the facilitator should reject.
    const { paymentHeader } = buildSignedPayment({ amount: "0.050 HBD" });
    const res = await fetch(`http://localhost:${apiPort}/api/dynamic?tier=premium`, {
      headers: { "x-payment": paymentHeader },
    });
    assert.equal(res.status, 402, "Should reject — server enforces its own price");
    const data = await res.json();
    assert.ok(data.reason || data.error, "Should have an error reason");
  });

  it("mutable price: payment at old price is rejected after price increases", async () => {
    // Get 402 at 0.050 HBD
    const res402 = await fetch(`http://localhost:${apiPort}/api/mutable`);
    assert.equal(res402.status, 402);
    const decoded = decodePaymentRequired(res402.headers.get("x-payment")!);
    assert.equal(getRequiredAmount(decoded.accepts[0]), "0.050 HBD");

    // Sign payment at the old price
    const { paymentHeader } = buildSignedPayment({ amount: "0.050 HBD" });

    // Price changes to 1.000 HBD
    setMutablePrice("1.000 HBD");

    // Payment signed at old price should be rejected — server recomputes price
    const res = await fetch(`http://localhost:${apiPort}/api/mutable`, {
      headers: { "x-payment": paymentHeader },
    });
    assert.equal(res.status, 402, "Should reject — payment is below new server price");

    // Reset for other tests
    setMutablePrice("0.050 HBD");
  });

  // ── Extra field tests ─────────────────────────────────────────────────

  it("402 response includes dynamic extra fields", async () => {
    const res = await fetch(`http://localhost:${apiPort}/api/with-extra?model=gpt4`);
    assert.equal(res.status, 402);
    const decoded = decodePaymentRequired(res.headers.get("x-payment")!);
    assert.deepEqual(decoded.accepts[0].extra, { model: "gpt4" });
  });

  it("402 response includes dynamic extra with default value", async () => {
    const res = await fetch(`http://localhost:${apiPort}/api/with-extra`);
    assert.equal(res.status, 402);
    const decoded = decodePaymentRequired(res.headers.get("x-payment")!);
    assert.deepEqual(decoded.accepts[0].extra, { model: "default" });
  });

  it("402 response includes static extra fields", async () => {
    const res = await fetch(`http://localhost:${apiPort}/api/static-extra`);
    assert.equal(res.status, 402);
    const decoded = decodePaymentRequired(res.headers.get("x-payment")!);
    assert.deepEqual(decoded.accepts[0].extra, { info: "static metadata" });
  });
});

describe("Metrics self-exclusion", () => {
  let server: Server;
  let port: number;

  before(async () => {
    const app = createFacilitator({
      nonceStore: new MemoryNonceStore(),
      hiveClient: createMockHiveClient(),
      enableMetrics: true,
    });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    port = (server.address() as any).port;
  });

  after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
  });

  it("/metrics and /stats requests are not counted in metrics", async () => {
    // Hit /metrics and /stats multiple times
    for (let i = 0; i < 5; i++) {
      await fetch(`http://localhost:${port}/metrics`);
      await fetch(`http://localhost:${port}/stats`);
    }

    const res = await fetch(`http://localhost:${port}/metrics`);
    const data = await res.json();

    // /metrics and /stats should not appear in endpoint stats
    assert.equal(data.endpoints["/metrics"], undefined, "/metrics should be excluded from metrics");
    assert.equal(data.endpoints["/stats"], undefined, "/stats should be excluded from metrics");
  });

  it("/health requests ARE counted in metrics", async () => {
    await fetch(`http://localhost:${port}/health`);

    const res = await fetch(`http://localhost:${port}/metrics`);
    const data = await res.json();
    assert.ok(data.endpoints["/health"], "/health should be tracked");
    assert.ok(data.endpoints["/health"].requests >= 1);
  });
});
