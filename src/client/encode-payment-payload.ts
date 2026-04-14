import type { SignedTransaction } from "@hiveio/dhive";
import {
  X402_VERSION,
  X402_VERSION_V2,
  HIVE_NETWORK,
  utf8ToBase64,
  type PaymentPayloadV1,
  type PaymentPayloadV2,
  type PaymentRequirementsV2,
  type ResourceInfo,
} from "../types.js";

export interface EncodePaymentPayloadOptions {
  /** The signed Hive transaction */
  signedTransaction: SignedTransaction;
  /** The nonce from buildPaymentTransaction() */
  nonce: string;
  /** Protocol version (default: 1) */
  x402Version?: 1 | 2;
  /** For v2: the accepted PaymentRequirements to echo back */
  accepted?: PaymentRequirementsV2;
  /** For v2: optional resource info */
  resource?: ResourceInfo;
}

/**
 * Encode a signed transaction + nonce into a base64 x-payment header value.
 *
 * Uses `btoa()` for browser compatibility — no Node.js `Buffer` dependency.
 */
export function encodePaymentPayload(opts: EncodePaymentPayloadOptions): string {
  const version = opts.x402Version ?? X402_VERSION;

  if (version === 2) {
    if (!opts.accepted) {
      throw new Error("v2 PaymentPayload requires 'accepted' (PaymentRequirementsV2)");
    }
    const payload: PaymentPayloadV2 = {
      x402Version: X402_VERSION_V2 as 2,
      accepted: opts.accepted,
      resource: opts.resource,
      payload: {
        signedTransaction: opts.signedTransaction,
        nonce: opts.nonce,
      },
    };
    return utf8ToBase64(JSON.stringify(payload));
  }

  const payload: PaymentPayloadV1 = {
    x402Version: X402_VERSION as 1,
    scheme: "exact",
    network: HIVE_NETWORK,
    payload: {
      signedTransaction: opts.signedTransaction,
      nonce: opts.nonce,
    },
  };
  return utf8ToBase64(JSON.stringify(payload));
}
