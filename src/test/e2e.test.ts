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
  HEADER_PAYMENT,
  HEADER_PAYMENT_RESPONSE,
  encodePayment,
  decodePaymentRequired,
  type PaymentPayload,
  type PaymentRequirements,
  type NonceStore,
  type SettleResponse,
} from "../types.js";

// ─── Test fixtures ──────────────────────────────────────────────────────────

const TEST_SENDER = "alice";
const TEST_RECEIVER = "bob";
const TEST_AMOUNT = "0.050 HBD";
const TEST_PRIVKEY = PrivateKey.fromSeed("test-e2e-seed");
const TEST_PUBKEY = TEST_PRIVKEY.createPublic().toString();

// ─── In-memory nonce store ──────────────────────────────────────────────────

class MemoryNonceStore implements NonceStore {
  private spent = new Set<string>();
  isSpent(nonce: string) { return this.spent.has(nonce); }
  markSpent(nonce: string) { this.spent.add(nonce); }
}

// ─── Mock dhive Client ──────────────────────────────────────────────────────

let broadcastCalls: SignedTransaction[] = [];

function createMockHiveClient(): Client {
  broadcastCalls = [];
  return {
    database: {
      getAccounts(names: string[]) {
        return Promise.resolve(
          names.map((name) => ({
            name,
            active: {
              weight_threshold: 1,
              account_auths: [],
              key_auths: [[TEST_PUBKEY, 1]],
            },
          }))
        );
      },
    },
    broadcast: {
      send(tx: SignedTransaction): Promise<TransactionConfirmation> {
        broadcastCalls.push(tx);
        return Promise.resolve({
          id: "mock_tx_" + randomBytes(8).toString("hex"),
          block_num: 99999,
          trx_num: 0,
          expired: false,
        });
      },
    },
  } as unknown as Client;
}

// ─── Helper: build and sign a test payment ──────────────────────────────────

function buildSignedPayment(opts: {
  from?: string;
  to?: string;
  amount?: string;
  expiresInMs?: number;
}): { paymentHeader: string; nonce: string; payload: PaymentPayload } {
  const nonce = randomBytes(16).toString("hex");
  const expiration = new Date(Date.now() + (opts.expiresInMs ?? 60_000))
    .toISOString()
    .slice(0, -5);

  const tx = {
    ref_block_num: 1234,
    ref_block_prefix: 5678,
    expiration,
    operations: [
      [
        "transfer",
        {
          from: opts.from ?? TEST_SENDER,
          to: opts.to ?? TEST_RECEIVER,
          amount: opts.amount ?? TEST_AMOUNT,
          memo: `x402:${nonce}`,
        },
      ] as unknown as Operation,
    ],
    extensions: [],
  };

  const signedTx = cryptoUtils.signTransaction(tx, TEST_PRIVKEY, HIVE_CHAIN_ID);

  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    scheme: "exact",
    network: HIVE_NETWORK,
    payload: { signedTransaction: signedTx, nonce },
  };

  return {
    paymentHeader: encodePayment(payload),
    nonce,
    payload,
  };
}

function makeRequirements(overrides: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    x402Version: X402_VERSION,
    scheme: "exact",
    network: HIVE_NETWORK,
    maxAmountRequired: TEST_AMOUNT,
    resource: "/api/premium",
    payTo: TEST_RECEIVER,
    validBefore: new Date(Date.now() + 5 * 60_000).toISOString(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("E2E: full 402 payment flow", () => {
  let facilitatorServer: Server;
  let apiServer: Server;
  let facilitatorPort: number;
  let apiPort: number;

  before(async () => {
    // Start facilitator with mock Hive client + memory nonce store
    const facilitatorApp = createFacilitator({
      nonceStore: new MemoryNonceStore(),
      hiveClient: createMockHiveClient(),
    });
    facilitatorServer = await new Promise<Server>((resolve) => {
      const s = facilitatorApp.listen(0, () => resolve(s));
    });
    facilitatorPort = (facilitatorServer.address() as any).port;

    // Start API server with paywalled endpoint
    const express = (await import("express")).default;
    const apiApp = express();

    apiApp.get("/api/free", (_req, res) => {
      res.json({ message: "free" });
    });

    apiApp.get(
      "/api/premium",
      paywall({
        amount: TEST_AMOUNT,
        receivingAccount: TEST_RECEIVER,
        facilitatorUrl: `http://localhost:${facilitatorPort}`,
      }),
      (req, res) => {
        res.json({
          message: "premium",
          payer: (req as any).payer,
          txId: (req as any).txId,
        });
      }
    );

    apiServer = await new Promise<Server>((resolve) => {
      const s = apiApp.listen(0, () => resolve(s));
    });
    apiPort = (apiServer.address() as any).port;
  });

  after(() => {
    facilitatorServer?.close();
    apiServer?.close();
  });

  // ── Facilitator direct tests ──────────────────────────────────────────

  it("GET /health returns ok", async () => {
    const res = await fetch(`http://localhost:${facilitatorPort}/health`);
    const data = await res.json();
    assert.equal(data.status, "ok");
  });

  it("GET /supported-networks returns hive:mainnet", async () => {
    const res = await fetch(`http://localhost:${facilitatorPort}/supported-networks`);
    const data = await res.json();
    assert.deepEqual(data.networks, [HIVE_NETWORK]);
  });

  it("POST /verify accepts valid signed payment", async () => {
    const { payload } = buildSignedPayment({});
    const res = await fetch(`http://localhost:${facilitatorPort}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentPayload: payload,
        paymentRequirements: makeRequirements(),
      }),
    });
    const data = await res.json();
    assert.equal(data.isValid, true);
    assert.equal(data.payer, TEST_SENDER);
  });

  it("POST /verify rejects wrong recipient", async () => {
    const { payload } = buildSignedPayment({ to: "eve" });
    const res = await fetch(`http://localhost:${facilitatorPort}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentPayload: payload,
        paymentRequirements: makeRequirements(),
      }),
    });
    const data = await res.json();
    assert.equal(data.isValid, false);
    assert.match(data.invalidReason!, /Recipient mismatch/);
  });

  it("POST /verify rejects insufficient amount", async () => {
    const { payload } = buildSignedPayment({ amount: "0.001 HBD" });
    const res = await fetch(`http://localhost:${facilitatorPort}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentPayload: payload,
        paymentRequirements: makeRequirements(),
      }),
    });
    const data = await res.json();
    assert.equal(data.isValid, false);
    assert.match(data.invalidReason!, /Insufficient payment/);
  });

  it("POST /settle broadcasts and returns txId", async () => {
    const { payload } = buildSignedPayment({});
    const res = await fetch(`http://localhost:${facilitatorPort}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentPayload: payload,
        paymentRequirements: makeRequirements(),
      }),
    });
    const data: SettleResponse = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.txId?.startsWith("mock_tx_"));
    assert.equal(data.blockNum, 99999);
    assert.equal(data.payer, TEST_SENDER);
    assert.equal(broadcastCalls.length, 1);
  });

  it("POST /settle rejects replay (same nonce)", async () => {
    const { payload } = buildSignedPayment({});
    // First settle — succeeds
    await fetch(`http://localhost:${facilitatorPort}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentPayload: payload,
        paymentRequirements: makeRequirements(),
      }),
    });
    // Second settle with same nonce — rejected
    const res = await fetch(`http://localhost:${facilitatorPort}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentPayload: payload,
        paymentRequirements: makeRequirements(),
      }),
    });
    const data: SettleResponse = await res.json();
    assert.equal(data.success, false);
    assert.match(data.errorReason!, /Nonce already spent/);
  });

  // ── Full flow: middleware → facilitator ────────────────────────────────

  it("free endpoint returns 200 without payment", async () => {
    const res = await fetch(`http://localhost:${apiPort}/api/free`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.message, "free");
  });

  it("premium endpoint returns 402 without payment", async () => {
    const res = await fetch(`http://localhost:${apiPort}/api/premium`);
    assert.equal(res.status, 402);

    const paymentHeader = res.headers.get(HEADER_PAYMENT);
    assert.ok(paymentHeader, "Should have x-payment header");

    const decoded = decodePaymentRequired(paymentHeader);
    assert.equal(decoded.x402Version, X402_VERSION);
    assert.equal(decoded.accepts.length, 1);
    assert.equal(decoded.accepts[0].network, HIVE_NETWORK);
    assert.equal(decoded.accepts[0].maxAmountRequired, TEST_AMOUNT);
    assert.equal(decoded.accepts[0].payTo, TEST_RECEIVER);
  });

  it("premium endpoint returns 200 with valid payment header", async () => {
    const { paymentHeader } = buildSignedPayment({});
    const res = await fetch(`http://localhost:${apiPort}/api/premium`, {
      headers: { [HEADER_PAYMENT]: paymentHeader },
    });

    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.message, "premium");
    assert.equal(data.payer, TEST_SENDER);
    assert.ok(data.txId?.startsWith("mock_tx_"));

    // Check x-payment-response header
    const responseHeader = res.headers.get(HEADER_PAYMENT_RESPONSE);
    assert.ok(responseHeader, "Should have x-payment-response header");
    const settleResult = JSON.parse(Buffer.from(responseHeader, "base64").toString());
    assert.equal(settleResult.success, true);
  });

  it("premium endpoint rejects invalid payment (wrong recipient)", async () => {
    const { paymentHeader } = buildSignedPayment({ to: "eve" });
    const res = await fetch(`http://localhost:${apiPort}/api/premium`, {
      headers: { [HEADER_PAYMENT]: paymentHeader },
    });
    assert.equal(res.status, 402);
    const data = await res.json();
    assert.match(data.reason, /Recipient mismatch/);
  });
});
