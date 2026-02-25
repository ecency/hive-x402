import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatHBD,
  parseHBD,
  encodePayment,
  decodePayment,
  encodePaymentRequired,
  decodePaymentRequired,
  X402_VERSION,
  HIVE_NETWORK,
  HIVE_CHAIN_ID,
  type PaymentPayload,
  type PaymentRequired,
} from "../types.js";

describe("formatHBD", () => {
  it("formats integer amounts", () => {
    assert.equal(formatHBD(1), "1.000 HBD");
  });

  it("formats fractional amounts with 3 decimal places", () => {
    assert.equal(formatHBD(0.05), "0.050 HBD");
  });

  it("formats zero", () => {
    assert.equal(formatHBD(0), "0.000 HBD");
  });

  it("formats large amounts", () => {
    assert.equal(formatHBD(1000.123), "1000.123 HBD");
  });
});

describe("parseHBD", () => {
  it("parses standard HBD strings", () => {
    assert.equal(parseHBD("0.050 HBD"), 0.05);
  });

  it("parses integer HBD strings", () => {
    assert.equal(parseHBD("1.000 HBD"), 1);
  });

  it("parses large amounts", () => {
    assert.equal(parseHBD("999.999 HBD"), 999.999);
  });

  it("throws on missing HBD suffix", () => {
    assert.throws(() => parseHBD("0.050"), /Invalid HBD asset string/);
  });

  it("throws on HIVE asset", () => {
    assert.throws(() => parseHBD("1.000 HIVE"), /Invalid HBD asset string/);
  });

  it("throws on wrong decimal places", () => {
    assert.throws(() => parseHBD("1.00 HBD"), /Invalid HBD asset string/);
  });

  it("throws on empty string", () => {
    assert.throws(() => parseHBD(""), /Invalid HBD asset string/);
  });
});

describe("encode/decode PaymentPayload", () => {
  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    scheme: "exact",
    network: HIVE_NETWORK,
    payload: {
      signedTransaction: {
        ref_block_num: 1,
        ref_block_prefix: 2,
        expiration: "2030-01-01T00:00:00",
        operations: [],
        extensions: [],
        signatures: ["abc123"],
      },
      nonce: "deadbeef",
    },
  };

  it("round-trips through encode/decode", () => {
    const encoded = encodePayment(payload);
    assert.equal(typeof encoded, "string");
    const decoded = decodePayment(encoded);
    assert.deepEqual(decoded, payload);
  });

  it("produces a base64 string", () => {
    const encoded = encodePayment(payload);
    assert.doesNotThrow(() => Buffer.from(encoded, "base64"));
  });
});

describe("encode/decode PaymentRequired", () => {
  const pr: PaymentRequired = {
    x402Version: X402_VERSION,
    accepts: [
      {
        x402Version: X402_VERSION,
        scheme: "exact",
        network: HIVE_NETWORK,
        maxAmountRequired: "0.050 HBD",
        resource: "/api/test",
        payTo: "bob",
        validBefore: "2030-01-01T00:00:00.000Z",
      },
    ],
  };

  it("round-trips through encode/decode", () => {
    const encoded = encodePaymentRequired(pr);
    const decoded = decodePaymentRequired(encoded);
    assert.deepEqual(decoded, pr);
  });
});

describe("constants", () => {
  it("HIVE_CHAIN_ID is 32 bytes starting with beeab0de", () => {
    assert.equal(HIVE_CHAIN_ID.length, 32);
    assert.equal(
      HIVE_CHAIN_ID.toString("hex"),
      "beeab0de00000000000000000000000000000000000000000000000000000000"
    );
  });

  it("HIVE_NETWORK is hive:mainnet", () => {
    assert.equal(HIVE_NETWORK, "hive:mainnet");
  });

  it("X402_VERSION is 1", () => {
    assert.equal(X402_VERSION, 1);
  });
});
