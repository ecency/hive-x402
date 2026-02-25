import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PrivateKey, cryptoUtils } from "@hiveio/dhive";
import type { Client, Operation } from "@hiveio/dhive";
import {
  HIVE_CHAIN_ID,
  X402_VERSION,
  HIVE_NETWORK,
  type PaymentRequirements,
} from "../types.js";
import { verifySignature } from "../facilitator/hive/verify-signature.js";

const TEST_PRIVKEY = PrivateKey.fromSeed("verify-test-seed");
const TEST_PUBKEY = TEST_PRIVKEY.createPublic().toString();

function mockClient(pubkey: string, accountExists = true): Client {
  return {
    database: {
      getAccounts(names: string[]) {
        if (!accountExists) return Promise.resolve([]);
        return Promise.resolve(
          names.map((name) => ({
            name,
            active: { weight_threshold: 1, account_auths: [], key_auths: [[pubkey, 1]] },
          }))
        );
      },
    },
  } as unknown as Client;
}

function buildSignedTx(opts: {
  from?: string;
  to?: string;
  amount?: string;
  expiresInMs?: number;
  memo?: string;
}) {
  const expiration = new Date(Date.now() + (opts.expiresInMs ?? 60_000))
    .toISOString()
    .slice(0, -5);

  const tx = {
    ref_block_num: 100,
    ref_block_prefix: 200,
    expiration,
    operations: [
      ["transfer", {
        from: opts.from ?? "alice",
        to: opts.to ?? "bob",
        amount: opts.amount ?? "0.050 HBD",
        memo: opts.memo ?? "x402:testnonce",
      }] as unknown as Operation,
    ],
    extensions: [],
  };
  return cryptoUtils.signTransaction(tx, TEST_PRIVKEY, HIVE_CHAIN_ID);
}

function reqs(overrides: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    x402Version: X402_VERSION,
    scheme: "exact",
    network: HIVE_NETWORK,
    maxAmountRequired: "0.050 HBD",
    resource: "/test",
    payTo: "bob",
    validBefore: new Date(Date.now() + 300_000).toISOString(),
    ...overrides,
  };
}

describe("verifySignature", () => {
  it("accepts valid signature", async () => {
    const signedTx = buildSignedTx({});
    const result = await verifySignature(signedTx, reqs(), { client: mockClient(TEST_PUBKEY) });
    assert.equal(result.isValid, true);
    assert.equal(result.payer, "alice");
  });

  it("rejects recipient mismatch", async () => {
    const signedTx = buildSignedTx({ to: "eve" });
    const result = await verifySignature(signedTx, reqs(), { client: mockClient(TEST_PUBKEY) });
    assert.equal(result.isValid, false);
    assert.match(result.invalidReason!, /Recipient mismatch/);
  });

  it("rejects insufficient amount", async () => {
    const signedTx = buildSignedTx({ amount: "0.010 HBD" });
    const result = await verifySignature(signedTx, reqs(), { client: mockClient(TEST_PUBKEY) });
    assert.equal(result.isValid, false);
    assert.match(result.invalidReason!, /Insufficient payment/);
  });

  it("accepts overpayment", async () => {
    const signedTx = buildSignedTx({ amount: "1.000 HBD" });
    const result = await verifySignature(signedTx, reqs(), { client: mockClient(TEST_PUBKEY) });
    assert.equal(result.isValid, true);
  });

  it("rejects non-HBD asset", async () => {
    const signedTx = buildSignedTx({ amount: "0.050 HIVE" });
    const result = await verifySignature(signedTx, reqs(), { client: mockClient(TEST_PUBKEY) });
    assert.equal(result.isValid, false);
    assert.match(result.invalidReason!, /Payment must be in HBD/);
  });

  it("rejects expired transaction", async () => {
    const signedTx = buildSignedTx({ expiresInMs: -1000 });
    const result = await verifySignature(signedTx, reqs(), { client: mockClient(TEST_PUBKEY) });
    assert.equal(result.isValid, false);
    assert.match(result.invalidReason!, /expired/i);
  });

  it("rejects expired requirements (validBefore)", async () => {
    const signedTx = buildSignedTx({});
    const result = await verifySignature(
      signedTx,
      reqs({ validBefore: new Date(Date.now() - 1000).toISOString() }),
      { client: mockClient(TEST_PUBKEY) }
    );
    assert.equal(result.isValid, false);
    assert.match(result.invalidReason!, /validBefore/);
  });

  it("rejects when account not found", async () => {
    const signedTx = buildSignedTx({});
    const result = await verifySignature(signedTx, reqs(), { client: mockClient(TEST_PUBKEY, false) });
    assert.equal(result.isValid, false);
    assert.match(result.invalidReason!, /not found/);
  });

  it("rejects wrong signing key", async () => {
    const signedTx = buildSignedTx({});
    const wrongPubkey = PrivateKey.fromSeed("wrong-key").createPublic().toString();
    const result = await verifySignature(signedTx, reqs(), { client: mockClient(wrongPubkey) });
    assert.equal(result.isValid, false);
    assert.match(result.invalidReason!, /does not match/);
  });

  it("rejects transaction with no signatures", async () => {
    const signedTx = buildSignedTx({});
    signedTx.signatures = [];
    const result = await verifySignature(signedTx, reqs(), { client: mockClient(TEST_PUBKEY) });
    assert.equal(result.isValid, false);
    assert.match(result.invalidReason!, /No signatures/);
  });

  it("rejects transaction with multiple operations", async () => {
    const signedTx = buildSignedTx({});
    signedTx.operations.push(signedTx.operations[0]);
    const result = await verifySignature(signedTx, reqs(), { client: mockClient(TEST_PUBKEY) });
    assert.equal(result.isValid, false);
    assert.match(result.invalidReason!, /Expected exactly one/);
  });
});
