import type { Client } from "@hiveio/dhive";
import type { Request, Response } from "express";
import { verifySignature } from "../hive/verify-signature.js";
import { broadcastTransaction } from "../hive/broadcast.js";
import type { NonceStore, SettleRequest, SettleResponse } from "../../types.js";

export function createSettleRoute(nonceStore: NonceStore, hiveClient?: Client) {
  return async (req: Request, res: Response) => {
    try {
      const { paymentPayload, paymentRequirements } = req.body as SettleRequest;

      if (!paymentPayload?.payload?.signedTransaction || !paymentRequirements) {
        res.status(400).json({ success: false, errorReason: "Missing required fields" });
        return;
      }

      const { signedTransaction, nonce } = paymentPayload.payload;

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
