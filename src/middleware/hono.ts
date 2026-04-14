import type { Context, Next } from "hono";
import {
  HEADER_PAYMENT,
  HEADER_PAYMENT_RESPONSE,
  X402_VERSION,
  X402_VERSION_V2,
  HIVE_NETWORK,
  decodePayment,
  encodePaymentRequired,
  utf8ToBase64,
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

const FACILITATOR_TIMEOUT_MS = 15_000;

export interface HonoPaywallOptions {
  /** Static HBD amount (e.g. "1.000 HBD") or a function that computes it per-request */
  amount: string | PriceFunction<Context>;
  /** Hive account to receive payment */
  receivingAccount: string;
  /** URL of the facilitator service, e.g. "http://localhost:4020" */
  facilitatorUrl: string;
  /** Resource description (optional) */
  description?: string;
  /** Response MIME type (optional) */
  mimeType?: string;
  /** Static extra fields or a function that computes them per-request */
  extra?: Record<string, unknown> | ExtraFunction<Context>;
  /** Protocol version for 402 responses (default: 2) */
  x402Version?: 1 | 2;
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
  const { amount, receivingAccount, facilitatorUrl, description, mimeType, extra } =
    options;
  const version = options.x402Version ?? 2;

  return async (c: Context, next: Next) => {
    const paymentHeader = c.req.header(HEADER_PAYMENT);

    // Compute validBefore once so the 402 response and verify/settle use the same window
    const validBefore = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    if (!paymentHeader) {
      // No payment — resolve dynamic pricing and return 402 with requirements
      const pricingCtx = { resource: c.req.path, raw: c };
      const resolvedAmount = typeof amount === "function" ? await amount(pricingCtx) : amount;
      const resolvedExtra = typeof extra === "function" ? await extra(pricingCtx) : extra;

      let paymentRequired: PaymentRequiredV1 | PaymentRequiredV2;

      if (version === 1) {
        const requirements: PaymentRequirementsV1 = {
          x402Version: X402_VERSION as 1,
          scheme: "exact",
          network: HIVE_NETWORK,
          maxAmountRequired: resolvedAmount,
          resource: c.req.path,
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
          resource: { url: c.req.path, description, mimeType },
          accepts: [requirements],
        };
      }

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
      // Use the amount from the signed transaction — don't recompute dynamic price.
      const paidAmount = (paymentPayload.payload.signedTransaction.operations[0]?.[1] as any)?.amount;

      let paymentRequirements;
      if (isV1Payload(paymentPayload)) {
        paymentRequirements = {
          x402Version: X402_VERSION as 1,
          scheme: "exact" as const,
          network: HIVE_NETWORK,
          maxAmountRequired: paidAmount ?? (typeof amount === "string" ? amount : "0.001 HBD"),
          resource: c.req.path,
          payTo: receivingAccount,
          validBefore,
        };
      } else {
        paymentRequirements = {
          scheme: "exact" as const,
          network: HIVE_NETWORK,
          amount: paidAmount ?? (typeof amount === "string" ? amount : "0.001 HBD"),
          payTo: receivingAccount,
        };
      }

      // Step 1: Verify
      const verifyController = new AbortController();
      const verifyTimer = setTimeout(() => verifyController.abort(), FACILITATOR_TIMEOUT_MS);
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
          return c.json(
            { error: "Facilitator verify error", status: verifyRes.status, body },
            502
          );
        }
        verifyResult = await verifyRes.json() as VerifyResponse;
      } catch (err) {
        clearTimeout(verifyTimer);
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error(`Facilitator verify timed out after ${FACILITATOR_TIMEOUT_MS}ms`);
        }
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
          body: JSON.stringify({ paymentPayload, paymentRequirements, validBefore }),
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
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error(`Facilitator settle timed out after ${FACILITATOR_TIMEOUT_MS}ms`);
        }
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
