import type { Client } from "@hiveio/dhive";
import type { Request, Response } from "express";
import { verifySignature } from "../hive/verify-signature.js";
import type { NonceStore, VerifyRequest, VerifyResponse } from "../../types.js";

export function createVerifyRoute(nonceStore: NonceStore, hiveClient?: Client) {
  return async (req: Request, res: Response) => {
    try {
      const { paymentPayload, paymentRequirements } = req.body as VerifyRequest;

      if (!paymentPayload?.payload?.signedTransaction || !paymentRequirements) {
        res.status(400).json({ isValid: false, invalidReason: "Missing required fields" });
        return;
      }

      const { signedTransaction, nonce } = paymentPayload.payload;

      // Check nonce hasn't been spent
      if (await nonceStore.isSpent(nonce)) {
        res.json({ isValid: false, invalidReason: "Nonce already spent (replay detected)" } satisfies VerifyResponse);
        return;
      }

      // Verify the signature and transaction details
      const result = await verifySignature(signedTransaction, paymentRequirements, { client: hiveClient });
      res.json(result satisfies VerifyResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ isValid: false, invalidReason: `Verification error: ${message}` } satisfies VerifyResponse);
    }
  };
}
