import type { Context, Next } from "hono";
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

export interface HonoPaywallOptions {
  /** Amount in HBD string, e.g. "1.000 HBD" */
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
 * Hono middleware that gates an endpoint behind an HBD micropayment via x402.
 *
 * On successful payment, sets `c.set("payer", ...)` and `c.set("txId", ...)`
 * for downstream handlers.
 *
 * Usage:
 *   app.post("/subscribe", honoPaywall({ amount: "1.000 HBD", ... }), handler);
 */
export function honoPaywall(options: HonoPaywallOptions) {
  const { amount, receivingAccount, facilitatorUrl, description, mimeType } =
    options;

  return async (c: Context, next: Next) => {
    const paymentHeader = c.req.header(HEADER_PAYMENT);

    if (!paymentHeader) {
      const requirements: PaymentRequirements = {
        x402Version: X402_VERSION,
        scheme: "exact",
        network: HIVE_NETWORK,
        maxAmountRequired: amount,
        resource: c.req.path,
        payTo: receivingAccount,
        validBefore: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        description,
        mimeType,
      };

      const paymentRequired: PaymentRequired = {
        x402Version: X402_VERSION,
        accepts: [requirements],
      };

      c.header(HEADER_PAYMENT, encodePaymentRequired(paymentRequired));
      return c.json(paymentRequired, 402);
    }

    let paymentPayload;
    try {
      paymentPayload = decodePayment(paymentHeader);
    } catch {
      return c.json({ error: "Malformed x-payment header" }, 400);
    }

    try {
      const paymentRequirements: PaymentRequirements = {
        x402Version: X402_VERSION,
        scheme: "exact",
        network: HIVE_NETWORK,
        maxAmountRequired: amount,
        resource: c.req.path,
        payTo: receivingAccount,
        validBefore: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      };

      // Step 1: Verify
      const verifyRes = await fetch(`${facilitatorUrl}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentPayload, paymentRequirements }),
      });
      const verifyResult: VerifyResponse = await verifyRes.json() as VerifyResponse;

      if (!verifyResult.isValid) {
        return c.json(
          { error: "Payment verification failed", reason: verifyResult.invalidReason },
          402
        );
      }

      // Step 2: Settle
      const settleRes = await fetch(`${facilitatorUrl}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentPayload, paymentRequirements }),
      });
      const settleResult: SettleResponse = await settleRes.json() as SettleResponse;

      if (!settleResult.success) {
        return c.json(
          { error: "Payment settlement failed", reason: settleResult.errorReason },
          402
        );
      }

      // Store payer info for downstream handlers
      c.set("payer", settleResult.payer!);
      c.set("txId", settleResult.txId!);

      // Add settlement header to response
      c.header(HEADER_PAYMENT_RESPONSE, btoa(JSON.stringify(settleResult)));

      await next();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return c.json(
        { error: "Payment processing error", reason: message },
        500
      );
    }
  };
}
