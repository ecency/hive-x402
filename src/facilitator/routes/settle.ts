import type { Client, SignedTransaction } from "@hiveio/dhive";
import type { Request, Response } from "express";
import { verifySignature } from "../hive/verify-signature.js";
import { broadcastTransaction } from "../hive/broadcast.js";
import type { NonceStore, SettleRequest, SettleResponse } from "../../types.js";

/** Extract the nonce from the transaction memo (`x402:{nonce}`), or null if missing/malformed. */
function extractMemoNonce(tx: SignedTransaction): string | null {
  const op = tx.operations?.[0];
  if (!op || op[0] !== "transfer") return null;
  const memo: string = (op[1] as { memo?: string }).memo ?? "";
  if (!memo.startsWith("x402:")) return null;
  return memo.slice(5);
}

export function createSettleRoute(nonceStore: NonceStore, hiveClient?: Client) {
  return async (req: Request, res: Response) => {
    try {
      const { paymentPayload, paymentRequirements } = req.body as SettleRequest;

      if (!paymentPayload?.payload?.signedTransaction || !paymentRequirements) {
        res.status(400).json({ success: false, errorReason: "Missing required fields" });
        return;
      }

      const { signedTransaction, nonce } = paymentPayload.payload;

      // Cross-validate: payload nonce must match the memo nonce in the transaction
      const memoNonce = extractMemoNonce(signedTransaction);
      if (memoNonce === null || memoNonce !== nonce) {
        res.json({
          success: false,
          errorReason: "Payload nonce does not match transaction memo nonce",
        } satisfies SettleResponse);
        return;
      }

      // Check nonce hasn't been spent
      if (await nonceStore.isSpent(nonce)) {
        res.json({ success: false, errorReason: "Nonce already spent (replay detected)" } satisfies SettleResponse);
        return;
      }

      // Re-verify before broadcasting
      const verification = await verifySignature(signedTransaction, paymentRequirements, { client: hiveClient });
      if (!verification.isValid) {
        res.json({
          success: false,
          errorReason: `Verification failed: ${verification.invalidReason}`,
        } satisfies SettleResponse);
        return;
      }

      // Broadcast to the Hive network
      const confirmation = await broadcastTransaction(signedTransaction, { client: hiveClient });

      // Mark nonce as spent AFTER successful broadcast
      await nonceStore.markSpent(nonce);

      res.json({
        success: true,
        txId: confirmation.id,
        blockNum: confirmation.block_num,
        payer: verification.payer,
      } satisfies SettleResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ success: false, errorReason: `Settlement error: ${message}` } satisfies SettleResponse);
    }
  };
}
