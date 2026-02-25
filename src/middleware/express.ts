import type { Request, Response, NextFunction } from "express";
import {
  HEADER_PAYMENT,
  HEADER_PAYMENT_RESPONSE,
  X402_VERSION,
  HIVE_NETWORK,
  decodePayment,
  encodePaymentRequired,
  type PaymentRequirements,
  type PaymentRequired,
  type VerifyResponse,
  type SettleResponse,
} from "../types.js";

export interface PaywallOptions {
  /** Amount in HBD string, e.g. "0.050 HBD" */
  amount: string;
  /** Hive account to receive payment */
  receivingAccount: string;
  /** URL of the facilitator service, e.g. "http://localhost:4020" */
  facilitatorUrl: string;
  /** Resource description (optional) */
  description?: string;
  /** Response MIME type (optional) */
  mimeType?: string;
}

/**
 * Express middleware that gates an endpoint behind an HBD micropayment via x402.
 *
 * Usage:
 *   app.get("/premium", paywall({ amount: "0.050 HBD", receivingAccount: "bob", facilitatorUrl: "..." }), handler);
 */
export function paywall(options: PaywallOptions) {
  const { amount, receivingAccount, facilitatorUrl, description, mimeType } =
    options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const paymentHeader = req.headers[HEADER_PAYMENT] as string | undefined;

    if (!paymentHeader) {
      // No payment — return 402 with requirements
      const requirements: PaymentRequirements = {
        x402Version: X402_VERSION,
        scheme: "exact",
        network: HIVE_NETWORK,
        maxAmountRequired: amount,
        resource: req.originalUrl,
        payTo: receivingAccount,
        validBefore: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        description,
        mimeType,
      };

      const paymentRequired: PaymentRequired = {
        x402Version: X402_VERSION,
        accepts: [requirements],
      };

      res
        .status(402)
        .set(HEADER_PAYMENT, encodePaymentRequired(paymentRequired))
        .json(paymentRequired);
      return;
    }

    // Decode and verify payment via facilitator
    let paymentPayload;
    try {
      paymentPayload = decodePayment(paymentHeader);
    } catch {
      res.status(400).json({ error: "Malformed x-payment header" });
      return;
    }

    try {

      const paymentRequirements: PaymentRequirements = {
        x402Version: X402_VERSION,
        scheme: "exact",
        network: HIVE_NETWORK,
        maxAmountRequired: amount,
        resource: req.originalUrl,
        payTo: receivingAccount,
        validBefore: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      };

      // Step 1: Verify
      const verifyRes = await fetch(`${facilitatorUrl}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentPayload, paymentRequirements }),
      });
      const verifyResult: VerifyResponse = await verifyRes.json();

      if (!verifyResult.isValid) {
        res.status(402).json({ error: "Payment verification failed", reason: verifyResult.invalidReason });
        return;
      }

      // Step 2: Settle
      const settleRes = await fetch(`${facilitatorUrl}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentPayload, paymentRequirements }),
      });
      const settleResult: SettleResponse = await settleRes.json();

      if (!settleResult.success) {
        res.status(402).json({ error: "Payment settlement failed", reason: settleResult.errorReason });
        return;
      }

      // Payment successful — attach settlement info to response header
      res.set(
        HEADER_PAYMENT_RESPONSE,
        Buffer.from(JSON.stringify(settleResult)).toString("base64")
      );

      // Attach payer info to request for downstream handlers
      (req as any).payer = settleResult.payer;
      (req as any).txId = settleResult.txId;

      next();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: "Payment processing error", reason: message });
    }
  };
}
