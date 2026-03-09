import type { Context, Next } from "hono";
import {
  HEADER_PAYMENT,
  HEADER_PAYMENT_RESPONSE,
  X402_VERSION,
  HIVE_NETWORK,
  decodePayment,
  encodePaymentRequired,
  utf8ToBase64,
  type PaymentRequirements,
  type PaymentRequired,
  type VerifyResponse,
  type SettleResponse,
} from "../types.js";

const FACILITATOR_TIMEOUT_MS = 15_000;

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

    // Compute validBefore once so the 402 response and verify/settle use the same window
    const validBefore = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    if (!paymentHeader) {
      const requirements: PaymentRequirements = {
        x402Version: X402_VERSION,
        scheme: "exact",
        network: HIVE_NETWORK,
        maxAmountRequired: amount,
        resource: c.req.path,
        payTo: receivingAccount,
        validBefore,
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
        validBefore,
      };

      // Step 1: Verify
      const verifyController = new AbortController();
      const verifyTimer = setTimeout(() => verifyController.abort(), FACILITATOR_TIMEOUT_MS);
      let verifyResult: VerifyResponse;
      try {
        const verifyRes = await fetch(`${facilitatorUrl}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentPayload, paymentRequirements }),
          signal: verifyController.signal,
        });
        clearTimeout(verifyTimer);
        if (!verifyRes.ok) {
          const body = await verifyRes.text().catch(() => "");
          return c.json(
            { error: "Facilitator verify error", status: verifyRes.status, body },
            502
          );
        }
        verifyResult = await verifyRes.json() as VerifyResponse;
      } catch (err) {
        clearTimeout(verifyTimer);
        throw err;
      }

      if (!verifyResult.isValid) {
        return c.json(
          { error: "Payment verification failed", reason: verifyResult.invalidReason },
          402
        );
      }

      // Step 2: Settle
      const settleController = new AbortController();
      const settleTimer = setTimeout(() => settleController.abort(), FACILITATOR_TIMEOUT_MS);
      let settleResult: SettleResponse;
      try {
        const settleRes = await fetch(`${facilitatorUrl}/settle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentPayload, paymentRequirements }),
          signal: settleController.signal,
        });
        clearTimeout(settleTimer);
        if (!settleRes.ok) {
          const body = await settleRes.text().catch(() => "");
          return c.json(
            { error: "Facilitator settle error", status: settleRes.status, body },
            502
          );
        }
        settleResult = await settleRes.json() as SettleResponse;
      } catch (err) {
        clearTimeout(settleTimer);
        throw err;
      }

      if (!settleResult.success) {
        return c.json(
          { error: "Payment settlement failed", reason: settleResult.errorReason },
          402
        );
      }

      // Store payer info for downstream handlers
      if (!settleResult.payer || !settleResult.txId) {
        return c.json(
          { error: "Facilitator returned success but missing payer or txId" },
          502
        );
      }
      c.set("payer", settleResult.payer);
      c.set("txId", settleResult.txId);

      // Add settlement header to response
      c.header(HEADER_PAYMENT_RESPONSE, utf8ToBase64(JSON.stringify(settleResult)));

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
