import type { SignedTransaction } from "@hiveio/dhive";
import {
  X402_VERSION,
  HIVE_NETWORK,
  utf8ToBase64,
  type PaymentPayload,
} from "../types.js";

export interface EncodePaymentPayloadOptions {
  /** The signed Hive transaction */
  signedTransaction: SignedTransaction;
  /** The nonce from buildPaymentTransaction() */
  nonce: string;
}

/**
 * Encode a signed transaction + nonce into a base64 x-payment header value.
 *
 * Uses `btoa()` for browser compatibility — no Node.js `Buffer` dependency.
 */
export function encodePaymentPayload(opts: EncodePaymentPayloadOptions): string {
  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    scheme: "exact",
    network: HIVE_NETWORK,
    payload: {
      signedTransaction: opts.signedTransaction,
      nonce: opts.nonce,
    },
  };

  return utf8ToBase64(JSON.stringify(payload));
}
