import { PrivateKey, cryptoUtils } from "@hiveio/dhive";
import {
  HIVE_CHAIN_ID,
  type PaymentRequirements,
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
}

/**
 * Construct and sign a Hive HBD transfer transaction (without broadcasting).
 * Returns a base64-encoded payment header string ready for X-PAYMENT.
 */
export async function signPayment(opts: SignPaymentOptions): Promise<string> {
  const { account, activeKey, requirements } = opts;
  const privKey = PrivateKey.fromString(activeKey);

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
  return encodePaymentPayload({ signedTransaction: signedTx, nonce });
}
