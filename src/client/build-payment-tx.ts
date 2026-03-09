import type { Transaction, TransferOperation } from "@hiveio/dhive";
import {
  HIVE_API_NODES,
  hexToBytes,
  type PaymentRequirements,
} from "../types.js";

export interface BuildPaymentTxOptions {
  /** Hive account name (sender) */
  account: string;
  /** Payment requirements from the 402 response */
  requirements: PaymentRequirements;
}

export interface UnsignedPaymentTx {
  /** Unsigned Hive transaction ready for signing */
  transaction: Transaction;
  /** Random nonce embedded in the memo for replay protection */
  nonce: string;
}

/**
 * Build an unsigned Hive HBD transfer transaction for x402 payment.
 *
 * Uses Web Crypto (`crypto.getRandomValues`) and `DataView` for
 * browser compatibility — no Node.js `Buffer` or `node:crypto` dependency.
 *
 * Returns the unsigned transaction + nonce for any signer (Keychain, HiveAuth, dhive).
 */
export async function buildPaymentTransaction(
  opts: BuildPaymentTxOptions
): Promise<UnsignedPaymentTx> {
  const { account, requirements } = opts;

  // Generate a random nonce (browser-compatible)
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = Array.from(nonceBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Get current block reference from Hive
  const props = await fetchDynamicGlobalProperties();
  const refBlockNum = props.head_block_number & 0xffff;

  // Parse block prefix using DataView (browser-compatible, no Buffer)
  const blockIdBytes = hexToBytes(props.head_block_id);
  const view = new DataView(blockIdBytes.buffer, blockIdBytes.byteOffset, blockIdBytes.byteLength);
  const refBlockPrefix = view.getUint32(4, true); // little-endian

  // Expiration: min(60s from now, validBefore) — fail fast if already expired
  const now = Date.now();
  let expiryMs = now + 60 * 1000;
  if (requirements.validBefore) {
    const validBeforeMs = new Date(requirements.validBefore).getTime();
    if (Number.isNaN(validBeforeMs)) {
      throw new Error("Invalid validBefore timestamp in payment requirements");
    }
    if (validBeforeMs <= now) {
      throw new Error("Payment requirements have expired (validBefore is in the past)");
    }
    if (validBeforeMs < expiryMs) {
      expiryMs = validBeforeMs;
    }
  }
  const expiration = new Date(expiryMs).toISOString().slice(0, -5);

  const transaction: Transaction = {
    ref_block_num: refBlockNum,
    ref_block_prefix: refBlockPrefix,
    expiration,
    operations: [
      [
        "transfer",
        {
          from: account,
          to: requirements.payTo,
          amount: requirements.maxAmountRequired,
          memo: `x402:${nonce}`,
        },
      ] as TransferOperation,
    ],
    extensions: [],
  };

  return { transaction, nonce };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface DynamicGlobalProperties {
  head_block_number: number;
  head_block_id: string;
}

const NODE_TIMEOUT_MS = 8000;

async function fetchDynamicGlobalProperties(): Promise<DynamicGlobalProperties> {
  let lastError: Error | undefined;
  for (const node of HIVE_API_NODES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NODE_TIMEOUT_MS);
    try {
      const res = await fetch(node, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "condenser_api.get_dynamic_global_properties",
          params: [],
          id: 1,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const json = await res.json() as any;
      const r = json.result;
      if (
        r &&
        typeof r.head_block_id === "string" &&
        r.head_block_id.length > 0 &&
        typeof r.head_block_number === "number" &&
        Number.isInteger(r.head_block_number)
      ) {
        return r;
      }
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error("All Hive API nodes failed");
}
