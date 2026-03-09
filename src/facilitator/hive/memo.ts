import type { SignedTransaction } from "@hiveio/dhive";

/** Extract the nonce from the transaction memo (`x402:{nonce}`), or null if missing/malformed. */
export function extractMemoNonce(tx: SignedTransaction): string | null {
  const op = tx.operations?.[0];
  if (!op || op[0] !== "transfer") return null;
  const memo: string = (op[1] as { memo?: string }).memo ?? "";
  if (!memo.startsWith("x402:")) return null;
  return memo.slice(5);
}
