import {
  HEADER_PAYMENT,
  HEADER_PAYMENT_RESPONSE,
  X402_VERSION,
  X402_VERSION_V2,
  HIVE_NETWORK,
  HBD_ASSET_ID,
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
  /** Protocol version for 402 responses (default: 2) */
  x402Version?: 1 | 2;
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
  const version = options.x402Version ?? 2;

  return async (req: Request): Promise<Response> => {
    const paymentHeader = req.headers.get(HEADER_PAYMENT);
    const url = new URL(req.url);

    if (!paymentHeader) {
      // No payment — resolve dynamic pricing and return 402 with requirements
      const pricingCtx = { resource: url.pathname, raw: req };
      const resolvedAmount = typeof amount === "function" ? await amount(pricingCtx) : amount;
      const resolvedExtra = typeof extra === "function" ? await extra(pricingCtx) : extra;
      const validBefore = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      let paymentRequired: PaymentRequiredV1 | PaymentRequiredV2;

      if (version === 1) {
        const requirements: PaymentRequirementsV1 = {
          x402Version: X402_VERSION as 1,
          scheme: "exact",
          network: HIVE_NETWORK,
          maxAmountRequired: resolvedAmount,
          resource: url.pathname,
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
          asset: HBD_ASSET_ID,
          amount: resolvedAmount,
          payTo: receivingAccount,
          maxTimeoutSeconds: 300,
          extra: resolvedExtra ?? {},
        };
        paymentRequired = {
          x402Version: X402_VERSION_V2 as 2,
          resource: { url: url.pathname, description, mimeType },
          accepts: [requirements],
        };
      }

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
      // Recompute the server-side price so the facilitator verifies the tx paid enough.
      const pricingCtx = { resource: url.pathname, raw: req };
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
          resource: url.pathname,
          payTo: receivingAccount,
          validBefore,
        };
      } else {
        paymentRequirements = {
          scheme: "exact" as const,
          network: HIVE_NETWORK,
          asset: HBD_ASSET_ID,
          amount: serverAmount,
          payTo: receivingAccount,
          maxTimeoutSeconds: 300,
          extra: {},
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
          return Response.json({ error: "Facilitator verify error", status: verifyRes.status, body }, { status: 502 });
        }
        verifyResult = await verifyRes.json() as VerifyResponse;
      } catch (err) {
        clearTimeout(verifyTimer);
        if (err instanceof Error && err.name === "AbortError") {
          return Response.json({ error: "Facilitator verify timed out" }, { status: 502 });
        }
        throw err;
      }

      if (!verifyResult.isValid) {
        return Response.json(
          { error: "Payment verification failed", reason: verifyResult.invalidReason },
          { status: 402 },
        );
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
          return Response.json({ error: "Facilitator settle error", status: settleRes.status, body }, { status: 502 });
        }
        settleResult = await settleRes.json() as SettleResponse;
      } catch (err) {
        clearTimeout(settleTimer);
        if (err instanceof Error && err.name === "AbortError") {
          return Response.json({ error: "Facilitator settle timed out" }, { status: 502 });
        }
        throw err;
      }

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
