import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { PrivateKey, cryptoUtils } from "@hiveio/dhive";
import type { Client, SignedTransaction, TransactionConfirmation, Operation } from "@hiveio/dhive";
import { randomBytes } from "node:crypto";

import { createFacilitator } from "../facilitator/index.js";
import { withPaywall } from "../middleware/nextjs.js";
import {
  HIVE_CHAIN_ID,
  X402_VERSION,
  HIVE_NETWORK,
  HEADER_PAYMENT,
  HEADER_PAYMENT_RESPONSE,
  encodePayment,
  decodePaymentRequired,
  type PaymentPayload,
  type NonceStore,
} from "../types.js";

const TEST_SENDER = "alice";
const TEST_RECEIVER = "bob";
const TEST_AMOUNT = "0.050 HBD";
const TEST_PRIVKEY = PrivateKey.fromSeed("nextjs-test-seed");
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
        return Promise.resolve({
          id: "mock_tx_" + randomBytes(8).toString("hex"),
          block_num: 12345,
          trx_num: 0,
          expired: false,
        });
      },
    },
  } as unknown as Client;
}

function buildSignedPayment(opts: { to?: string } = {}) {
  const nonce = randomBytes(16).toString("hex");
  const expiration = new Date(Date.now() + 60_000).toISOString().slice(0, -5);

  const tx = {
    ref_block_num: 1234,
    ref_block_prefix: 5678,
    expiration,
    operations: [
      ["transfer", {
        from: TEST_SENDER,
        to: opts.to ?? TEST_RECEIVER,
        amount: TEST_AMOUNT,
        memo: `x402:${nonce}`,
      }] as unknown as Operation,
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

  return encodePayment(payload);
}

describe("Next.js withPaywall middleware", () => {
  let facilitatorServer: Server;
  let facilitatorPort: number;
  let paywallHandler: (req: Request) => Promise<Response>;

  before(async () => {
    const facilitatorApp = createFacilitator({
      nonceStore: new MemoryNonceStore(),
      hiveClient: createMockHiveClient(),
      rateLimit: false,
    });
    facilitatorServer = await new Promise<Server>((resolve) => {
      const s = facilitatorApp.listen(0, () => resolve(s));
    });
    facilitatorPort = (facilitatorServer.address() as any).port;

    paywallHandler = withPaywall(
      {
        amount: TEST_AMOUNT,
        receivingAccount: TEST_RECEIVER,
        facilitatorUrl: `http://localhost:${facilitatorPort}`,
      },
      async (_req, ctx) => {
        return Response.json({ message: "premium", payer: ctx.payer, txId: ctx.txId });
      },
    );
  });

  after(() => facilitatorServer?.close());

  it("returns 402 with payment requirements when no header", async () => {
    const req = new Request("http://localhost/api/premium");
    const res = await paywallHandler(req);

    assert.equal(res.status, 402);
    const paymentHeader = res.headers.get(HEADER_PAYMENT);
    assert.ok(paymentHeader);

    const decoded = decodePaymentRequired(paymentHeader);
    assert.equal(decoded.x402Version, X402_VERSION);
    assert.equal(decoded.accepts[0].network, HIVE_NETWORK);
    assert.equal(decoded.accepts[0].maxAmountRequired, TEST_AMOUNT);
    assert.equal(decoded.accepts[0].payTo, TEST_RECEIVER);
  });

  it("returns 200 with valid payment", async () => {
    const header = buildSignedPayment();
    const req = new Request("http://localhost/api/premium", {
      headers: { [HEADER_PAYMENT]: header },
    });
    const res = await paywallHandler(req);

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.message, "premium");
    assert.equal(data.payer, TEST_SENDER);
    assert.ok(data.txId.startsWith("mock_tx_"));

    const responseHeader = res.headers.get(HEADER_PAYMENT_RESPONSE);
    assert.ok(responseHeader);
  });

  it("returns 400 for malformed header", async () => {
    const req = new Request("http://localhost/api/premium", {
      headers: { [HEADER_PAYMENT]: "garbage!!!" },
    });
    const res = await paywallHandler(req);
    assert.equal(res.status, 400);
  });

  it("returns 402 for wrong recipient", async () => {
    const header = buildSignedPayment({ to: "eve" });
    const req = new Request("http://localhost/api/premium", {
      headers: { [HEADER_PAYMENT]: header },
    });
    const res = await paywallHandler(req);
    assert.equal(res.status, 402);
    const data = await res.json();
    assert.match(data.reason, /Recipient mismatch/);
  });
});
