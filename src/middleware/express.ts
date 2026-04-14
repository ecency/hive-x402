import type { Request, Response, NextFunction } from "express";
import {
  HEADER_PAYMENT,
  HEADER_PAYMENT_RESPONSE,
  X402_VERSION,
  X402_VERSION_V2,
  HIVE_NETWORK,
  decodePayment,
  encodePaymentRequired,
  isV1Payload,
  type PaymentRequirementsV1,
  type PaymentRequirementsV2,
  type PaymentRequiredV1,
  type PaymentRequiredV2,
  type VerifyResponse,
  type SettleResponse,
  type PriceFunction,
  type ExtraFunction,
} from "../types.js";

export interface PaywallOptions {
  /** Static HBD amount (e.g. "0.050 HBD") or a function that computes it per-request */
  amount: string | PriceFunction<Request>;
  /** Hive account to receive payment */
  receivingAccount: string;
  /** URL of the facilitator service, e.g. "http://localhost:4020" */
  facilitatorUrl: string;
  /** Resource description (optional) */
  description?: string;
  /** Response MIME type (optional) */
  mimeType?: string;
  /** Static extra fields or a function that computes them per-request */
  extra?: Record<string, unknown> | ExtraFunction<Request>;
  /** Protocol version for 402 responses (default: 2) */
  x402Version?: 1 | 2;
}

/**
 * Express middleware that gates an endpoint behind an HBD micropayment via x402.
 *
 * Usage:
 *   app.get("/premium", paywall({ amount: "0.050 HBD", receivingAccount: "bob", facilitatorUrl: "..." }), handler);
 */
export function paywall(options: PaywallOptions) {
  const { amount, receivingAccount, facilitatorUrl, description, mimeType, extra } =
    options;
  const version = options.x402Version ?? 2;

  return async (req: Request, res: Response, next: NextFunction) => {
    const paymentHeader = req.headers[HEADER_PAYMENT] as string | undefined;

    if (!paymentHeader) {
      // No payment — resolve dynamic pricing and return 402 with requirements
      let resolvedAmount: string;
      let resolvedExtra: Record<string, unknown> | undefined;
      try {
        const pricingCtx = { resource: req.originalUrl, raw: req };
        resolvedAmount = typeof amount === "function" ? await amount(pricingCtx) : amount;
        resolvedExtra = typeof extra === "function" ? await extra(pricingCtx) : extra;
      } catch (err) {
        next(err);
        return;
      }
      const validBefore = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      let paymentRequired: PaymentRequiredV1 | PaymentRequiredV2;

      if (version === 1) {
        const requirements: PaymentRequirementsV1 = {
          x402Version: X402_VERSION as 1,
          scheme: "exact",
          network: HIVE_NETWORK,
          maxAmountRequired: resolvedAmount,
          resource: req.originalUrl,
          payTo: receivingAccount,
          validBefore,
          description,
          mimeType,
          extra: resolvedExtra,
        };
        paymentRequired = { x402Version: X402_VERSION as 1, accepts: [requirements] };
      } else {
        const requirements: PaymentRequirementsV2 = {
          scheme: "exact",
          network: HIVE_NETWORK,
          amount: resolvedAmount,
          payTo: receivingAccount,
          extra: resolvedExtra,
        };
        paymentRequired = {
          x402Version: X402_VERSION_V2 as 2,
          resource: { url: req.originalUrl, description, mimeType },
          accepts: [requirements],
        };
      }

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
      // Recompute the server-side price so the facilitator verifies the tx paid enough.
      const pricingCtx = { resource: req.originalUrl, raw: req };
      const serverAmount = typeof amount === "function" ? await amount(pricingCtx) : amount;
      const validBefore = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      // Build requirements using the server's authoritative price
      let paymentRequirements;
      if (isV1Payload(paymentPayload)) {
        paymentRequirements = {
          x402Version: X402_VERSION as 1,
          scheme: "exact" as const,
          network: HIVE_NETWORK,
          maxAmountRequired: serverAmount,
          resource: req.originalUrl,
          payTo: receivingAccount,
          validBefore,
        };
      } else {
        paymentRequirements = {
          scheme: "exact" as const,
          network: HIVE_NETWORK,
          amount: serverAmount,
          payTo: receivingAccount,
        };
      }

      // Step 1: Verify
      const verifyController = new AbortController();
      const verifyTimer = setTimeout(() => verifyController.abort(), 15_000);
      let verifyResult: VerifyResponse;
      try {
        const verifyRes = await fetch(`${facilitatorUrl}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentPayload, paymentRequirements, validBefore }),
          signal: verifyController.signal,
        });
        clearTimeout(verifyTimer);
        if (!verifyRes.ok) {
          const body = await verifyRes.text().catch(() => "");
          res.status(502).json({ error: "Facilitator verify error", status: verifyRes.status, body });
          return;
        }
        verifyResult = await verifyRes.json() as VerifyResponse;
      } catch (err) {
        clearTimeout(verifyTimer);
        if (err instanceof Error && err.name === "AbortError") {
          res.status(502).json({ error: "Facilitator verify timed out" });
          return;
        }
        throw err;
      }

      if (!verifyResult.isValid) {
        res.status(402).json({ error: "Payment verification failed", reason: verifyResult.invalidReason });
        return;
      }

      // Step 2: Settle
      const settleController = new AbortController();
      const settleTimer = setTimeout(() => settleController.abort(), 15_000);
      let settleResult: SettleResponse;
      try {
        const settleRes = await fetch(`${facilitatorUrl}/settle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentPayload, paymentRequirements, validBefore }),
          signal: settleController.signal,
        });
        clearTimeout(settleTimer);
        if (!settleRes.ok) {
          const body = await settleRes.text().catch(() => "");
          res.status(502).json({ error: "Facilitator settle error", status: settleRes.status, body });
          return;
        }
        settleResult = await settleRes.json() as SettleResponse;
      } catch (err) {
        clearTimeout(settleTimer);
        if (err instanceof Error && err.name === "AbortError") {
          res.status(502).json({ error: "Facilitator settle timed out" });
          return;
        }
        throw err;
      }

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
