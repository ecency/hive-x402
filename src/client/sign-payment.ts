import { PrivateKey, cryptoUtils } from "@hiveio/dhive";
import {
  HIVE_CHAIN_ID,
  isV1Requirements,
  type PaymentRequirements,
  type PaymentRequirementsV2,
  type ResourceInfo,
} from "../types.js";
import { buildPaymentTransaction } from "./build-payment-tx.js";
import { encodePaymentPayload } from "./encode-payment-payload.js";

export interface SignPaymentOptions {
  /** Hive account name (sender) */
  account: string;
  /** Active private key in WIF format */
  activeKey: string;
  /** Payment requirements from the 402 response */
  requirements: PaymentRequirements;
  /** Protocol version (default: auto-detect from requirements) */
  x402Version?: 1 | 2;
  /** For v2: resource info from the PaymentRequired envelope */
  resource?: ResourceInfo;
}

/**
 * Construct and sign a Hive HBD transfer transaction (without broadcasting).
 * Returns a base64-encoded payment header string ready for X-PAYMENT.
 */
export async function signPayment(opts: SignPaymentOptions): Promise<string> {
  const { account, activeKey, requirements, resource } = opts;
  const privKey = PrivateKey.fromString(activeKey);
  const version = opts.x402Version ?? (isV1Requirements(requirements) ? 1 : 2);

  // Build unsigned transaction
  const { transaction, nonce } = await buildPaymentTransaction({
    account,
    requirements,
  });

  // Sign with dhive (server-side, uses private key directly)
  const signedTx = cryptoUtils.signTransaction(
    transaction,
    privKey,
    Buffer.from(HIVE_CHAIN_ID)
  );

  // Encode for x-payment header
  return encodePaymentPayload({
    signedTransaction: signedTx,
    nonce,
    x402Version: version,
    accepted: version === 2 ? (requirements as PaymentRequirementsV2) : undefined,
    resource,
  });
}
