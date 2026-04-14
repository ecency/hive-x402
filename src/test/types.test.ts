import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatHBD,
  parseHBD,
  encodePayment,
  decodePayment,
  encodePaymentRequired,
  decodePaymentRequired,
  getRequiredAmount,
  isV1Requirements,
  X402_VERSION,
  X402_VERSION_V2,
  HIVE_NETWORK,
  HIVE_CHAIN_ID,
  type PaymentPayloadV1,
  type PaymentPayloadV2,
  type PaymentRequiredV1,
  type PaymentRequiredV2,
  type PaymentRequirementsV1,
  type PaymentRequirementsV2,
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

describe("encode/decode PaymentPayload v1", () => {
  const payload: PaymentPayloadV1 = {
    x402Version: 1,
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
    assert.doesNotThrow(() => atob(encoded));
  });
});

describe("encode/decode PaymentPayload v2", () => {
  const payload: PaymentPayloadV2 = {
    x402Version: 2,
    accepted: {
      scheme: "exact",
      network: HIVE_NETWORK,
      amount: "0.050 HBD",
      payTo: "bob",
    },
    resource: { url: "/api/test", description: "Test resource" },
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
    const decoded = decodePayment(encoded);
    assert.deepEqual(decoded, payload);
  });

  it("decoded payload has x402Version 2", () => {
    const encoded = encodePayment(payload);
    const decoded = decodePayment(encoded);
    assert.equal(decoded.x402Version, 2);
  });
});

describe("encode/decode PaymentRequired v1", () => {
  const pr: PaymentRequiredV1 = {
    x402Version: 1,
    accepts: [
      {
        x402Version: 1,
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

describe("encode/decode PaymentRequired v2", () => {
  const pr: PaymentRequiredV2 = {
    x402Version: 2,
    resource: { url: "/api/test", description: "Test" },
    accepts: [
      {
        scheme: "exact",
        network: HIVE_NETWORK,
        amount: "0.050 HBD",
        payTo: "bob",
      },
    ],
  };

  it("round-trips through encode/decode", () => {
    const encoded = encodePaymentRequired(pr);
    const decoded = decodePaymentRequired(encoded);
    assert.deepEqual(decoded, pr);
  });

  it("decoded has x402Version 2", () => {
    const encoded = encodePaymentRequired(pr);
    const decoded = decodePaymentRequired(encoded);
    assert.equal(decoded.x402Version, 2);
  });
});

describe("getRequiredAmount", () => {
  it("returns maxAmountRequired for v1", () => {
    const v1: PaymentRequirementsV1 = {
      x402Version: 1,
      scheme: "exact",
      network: HIVE_NETWORK,
      maxAmountRequired: "0.050 HBD",
      resource: "/test",
      payTo: "bob",
      validBefore: "2030-01-01T00:00:00.000Z",
    };
    assert.equal(getRequiredAmount(v1), "0.050 HBD");
  });

  it("returns amount for v2", () => {
    const v2: PaymentRequirementsV2 = {
      scheme: "exact",
      network: HIVE_NETWORK,
      amount: "1.000 HBD",
      payTo: "bob",
    };
    assert.equal(getRequiredAmount(v2), "1.000 HBD");
  });
});

describe("isV1Requirements", () => {
  it("returns true for v1", () => {
    const v1: PaymentRequirementsV1 = {
      x402Version: 1,
      scheme: "exact",
      network: HIVE_NETWORK,
      maxAmountRequired: "0.050 HBD",
      resource: "/test",
      payTo: "bob",
      validBefore: "2030-01-01T00:00:00.000Z",
    };
    assert.equal(isV1Requirements(v1), true);
  });

  it("returns false for v2", () => {
    const v2: PaymentRequirementsV2 = {
      scheme: "exact",
      network: HIVE_NETWORK,
      amount: "0.050 HBD",
      payTo: "bob",
    };
    assert.equal(isV1Requirements(v2), false);
  });
});

describe("constants", () => {
  it("HIVE_CHAIN_ID is 32 bytes starting with beeab0de", () => {
    assert.equal(HIVE_CHAIN_ID.length, 32);
    const hex = Array.from(HIVE_CHAIN_ID)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    assert.equal(
      hex,
      "beeab0de00000000000000000000000000000000000000000000000000000000"
    );
  });

  it("HIVE_NETWORK is hive:mainnet", () => {
    assert.equal(HIVE_NETWORK, "hive:mainnet");
  });

  it("X402_VERSION is 1", () => {
    assert.equal(X402_VERSION, 1);
  });

  it("X402_VERSION_V2 is 2", () => {
    assert.equal(X402_VERSION_V2, 2);
  });
});
