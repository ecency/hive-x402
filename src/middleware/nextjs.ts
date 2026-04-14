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
  type PriceFunction,
  type ExtraFunction,
} from "../types.js";

export interface NextPaywallOptions {
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
}

/**
 * Next.js App Router wrapper that gates a route handler behind an HBD micropayment.
 * Uses standard Web Request/Response APIs — no Next.js dependency required.
 *
 * Usage in app/api/premium/route.ts:
 *   import { withPaywall } from "@hiveio/x402/middleware/nextjs";
 *
 *   async function handler(req: Request, context: { payer: string; txId: string }) {
 *     return Response.json({ message: "Premium content", payer: context.payer });
 *   }
 *
 *   export const GET = withPaywall({
 *     amount: "0.050 HBD",
 *     receivingAccount: "bob",
 *     facilitatorUrl: "http://localhost:4020",
 *   }, handler);
 */
export function withPaywall(
  options: NextPaywallOptions,
  handler: (req: Request, context: { payer: string; txId: string }) => Response | Promise<Response>,
): (req: Request) => Promise<Response> {
  const { amount, receivingAccount, facilitatorUrl, description, mimeType, extra } = options;

  return async (req: Request): Promise<Response> => {
    const paymentHeader = req.headers.get(HEADER_PAYMENT);
    const url = new URL(req.url);

    if (!paymentHeader) {
      // No payment — resolve dynamic pricing and return 402 with requirements
      const pricingCtx = { resource: url.pathname, raw: req };
      const resolvedAmount = typeof amount === "function" ? await amount(pricingCtx) : amount;
      const resolvedExtra = typeof extra === "function" ? await extra(pricingCtx) : extra;

      const requirements: PaymentRequirements = {
        x402Version: X402_VERSION,
        scheme: "exact",
        network: HIVE_NETWORK,
        maxAmountRequired: resolvedAmount,
        resource: url.pathname,
        payTo: receivingAccount,
        validBefore: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        description,
        mimeType,
        extra: resolvedExtra,
      };

      const paymentRequired: PaymentRequired = {
        x402Version: X402_VERSION,
        accepts: [requirements],
      };

      return new Response(JSON.stringify(paymentRequired), {
        status: 402,
        headers: {
          "Content-Type": "application/json",
          [HEADER_PAYMENT]: encodePaymentRequired(paymentRequired),
        },
      });
    }

    // Decode payment header
    let paymentPayload;
    try {
      paymentPayload = decodePayment(paymentHeader);
    } catch {
      return Response.json({ error: "Malformed x-payment header" }, { status: 400 });
    }

    try {
      // Use the amount from the signed transaction — don't recompute dynamic price.
      const paidAmount = (paymentPayload.payload.signedTransaction.operations[0]?.[1] as any)?.amount;

      const paymentRequirements: PaymentRequirements = {
        x402Version: X402_VERSION,
        scheme: "exact",
        network: HIVE_NETWORK,
        maxAmountRequired: paidAmount ?? (typeof amount === "string" ? amount : "0.001 HBD"),
        resource: url.pathname,
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
        return Response.json(
          { error: "Payment verification failed", reason: verifyResult.invalidReason },
          { status: 402 },
        );
      }

      // Step 2: Settle
      const settleRes = await fetch(`${facilitatorUrl}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentPayload, paymentRequirements }),
      });
      const settleResult: SettleResponse = await settleRes.json();

      if (!settleResult.success) {
        return Response.json(
          { error: "Payment settlement failed", reason: settleResult.errorReason },
          { status: 402 },
        );
      }

      // Call the actual handler with payer context
      const response = await handler(req, {
        payer: settleResult.payer!,
        txId: settleResult.txId!,
      });

      // Clone response and add settlement header
      const headers = new Headers(response.headers);
      headers.set(
        HEADER_PAYMENT_RESPONSE,
        btoa(JSON.stringify(settleResult)),
      );

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return Response.json(
        { error: "Payment processing error", reason: message },
        { status: 500 },
      );
    }
  };
}
