import { Client, PrivateKey, cryptoUtils } from "@hiveio/dhive";
import { randomBytes } from "node:crypto";
import {
  HIVE_CHAIN_ID,
  HIVE_API_NODES,
  encodePayment,
  formatHBD,
  parseHBD,
  X402_VERSION,
  HIVE_NETWORK,
  type PaymentRequirements,
  type PaymentPayload,
} from "../types.js";

const hiveClient = new Client(HIVE_API_NODES, { timeout: 8000 });

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

  // Generate a random nonce for replay protection
  const nonce = randomBytes(16).toString("hex");

  // Get current block reference for the transaction
  const props = await hiveClient.database.getDynamicGlobalProperties();
  const refBlockNum = props.head_block_number & 0xffff;
  const refBlockId = props.head_block_id;
  const refBlockPrefix = Buffer.from(refBlockId, "hex").readUInt32LE(4);

  // Expiration: 60 seconds from now (Hive max is ~3600s)
  const expiration = new Date(Date.now() + 60 * 1000)
    .toISOString()
    .slice(0, -5);

  const amount = requirements.maxAmountRequired;

  const tx = {
    ref_block_num: refBlockNum,
    ref_block_prefix: refBlockPrefix,
    expiration,
    operations: [
      [
        "transfer",
        {
          from: account,
          to: requirements.payTo,
          amount,
          memo: `x402:${nonce}`,
        },
      ] as const,
    ],
    extensions: [],
  };

  const signedTx = cryptoUtils.signTransaction(tx, privKey, HIVE_CHAIN_ID);

  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    scheme: "exact",
    network: HIVE_NETWORK,
    payload: {
      signedTransaction: signedTx,
      nonce,
    },
  };

  return encodePayment(payload);
}
