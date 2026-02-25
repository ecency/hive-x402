import { cryptoUtils, Signature } from "@hiveio/dhive";
import type { Client, SignedTransaction } from "@hiveio/dhive";
import { withFailover } from "./nodes.js";
import {
  HIVE_CHAIN_ID,
  HBD_ASSET,
  parseHBD,
  type PaymentRequirements,
  type VerifyResponse,
} from "../../types.js";

export interface VerifySignatureOptions {
  /** Optional dhive Client for dependency injection (testing). Falls back to node pool. */
  client?: Client;
}

/**
 * Verify that a signed Hive transaction is valid for the given payment requirements:
 * 1. Contains exactly one transfer operation
 * 2. Transfer recipient and amount match requirements
 * 3. Transaction hasn't expired
 * 4. Signature recovers to the sender's active public key on-chain
 */
export async function verifySignature(
  signedTx: SignedTransaction,
  requirements: PaymentRequirements,
  options: VerifySignatureOptions = {}
): Promise<VerifyResponse> {
  // 1. Validate structure — single transfer op
  const ops = signedTx.operations;
  if (ops.length !== 1 || ops[0][0] !== "transfer") {
    return { isValid: false, invalidReason: "Expected exactly one transfer operation" };
  }

  const [, transfer] = ops[0] as ["transfer", { from: string; to: string; amount: string; memo: string }];

  // 2. Check recipient
  if (transfer.to !== requirements.payTo) {
    return {
      isValid: false,
      invalidReason: `Recipient mismatch: expected ${requirements.payTo}, got ${transfer.to}`,
    };
  }

  // 3. Check asset is HBD
  if (!transfer.amount.endsWith(HBD_ASSET)) {
    return { isValid: false, invalidReason: `Payment must be in ${HBD_ASSET}` };
  }

  // 4. Check amount
  const paid = parseHBD(transfer.amount);
  const required = parseHBD(requirements.maxAmountRequired);
  if (paid < required) {
    return {
      isValid: false,
      invalidReason: `Insufficient payment: required ${requirements.maxAmountRequired}, got ${transfer.amount}`,
    };
  }

  // 5. Check expiration
  const expiry = new Date(signedTx.expiration + "Z");
  if (expiry <= new Date()) {
    return { isValid: false, invalidReason: "Transaction has expired" };
  }

  // 6. Check validBefore from requirements
  const validBefore = new Date(requirements.validBefore);
  if (new Date() >= validBefore) {
    return { isValid: false, invalidReason: "Payment requirements have expired (validBefore)" };
  }

  // 7. Verify signature against sender's active key on-chain
  if (!signedTx.signatures || signedTx.signatures.length === 0) {
    return { isValid: false, invalidReason: "No signatures present" };
  }

  const digest = cryptoUtils.transactionDigest(signedTx, HIVE_CHAIN_ID);
  const sig = Signature.fromString(signedTx.signatures[0]);
  const recoveredKey = sig.recover(digest);

  // Fetch the sender's active public keys from the blockchain
  const getAccounts = options.client
    ? (names: string[]) => options.client!.database.getAccounts(names)
    : (names: string[]) => withFailover((c) => c.database.getAccounts(names));

  const accounts = await getAccounts([transfer.from]);

  if (accounts.length === 0) {
    return { isValid: false, invalidReason: `Account @${transfer.from} not found on chain` };
  }

  const account = accounts[0];
  const activeKeyAuths: [string, number][] = account.active.key_auths as [string, number][];
  const recoveredStr = recoveredKey.toString();
  const keyMatch = activeKeyAuths.some(([pubkey]) => pubkey === recoveredStr);

  if (!keyMatch) {
    return {
      isValid: false,
      invalidReason: `Signature does not match any active key of @${transfer.from}`,
    };
  }

  return { isValid: true, payer: transfer.from };
}
