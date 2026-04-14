/**
 * Example: API server with dynamic pricing based on request parameters.
 *
 * Demonstrates:
 *   - Price callback: different prices for different tiers/models
 *   - Extra fields: passing metadata to the client in the 402 response
 *
 * Run the facilitator first:
 *   FACILITATOR_PORT=4020 pnpm dev
 *
 * Then run this server:
 *   npx tsx examples/dynamic-pricing-server.ts
 *
 * Test:
 *   curl http://localhost:3000/api/ai?model=basic     →  402 (0.010 HBD)
 *   curl http://localhost:3000/api/ai?model=advanced   →  402 (0.100 HBD)
 *   curl http://localhost:3000/api/data?tier=premium    →  402 (0.500 HBD)
 */
import express from "express";
import { paywall } from "../src/middleware/express.js";
import type { PricingContext } from "../src/types.js";
import type { Request } from "express";

const app = express();

// ─── Dynamic pricing based on model parameter ──────────────────────────────

const MODEL_PRICES: Record<string, string> = {
  basic: "0.010 HBD",
  advanced: "0.100 HBD",
  premium: "0.500 HBD",
};

app.get(
  "/api/ai",
  paywall({
    amount: ({ raw: req }: PricingContext<Request>) => {
      const model = (req.query.model as string) ?? "basic";
      return MODEL_PRICES[model] ?? MODEL_PRICES.basic;
    },
    receivingAccount: "your-hive-account",
    facilitatorUrl: "http://localhost:4020",
    description: "AI inference endpoint — price varies by model",
    extra: ({ raw: req }: PricingContext<Request>) => ({
      model: (req.query.model as string) ?? "basic",
      pricing: MODEL_PRICES,
    }),
  }),
  (req, res) => {
    const model = (req.query.model as string) ?? "basic";
    res.json({
      message: `AI response from ${model} model`,
      payer: (req as any).payer,
      txId: (req as any).txId,
    });
  }
);

// ─── Tiered data access with static extra fields ───────────────────────────

app.get(
  "/api/data",
  paywall({
    amount: ({ raw: req }: PricingContext<Request>) => {
      const tier = (req.query.tier as string) ?? "standard";
      return tier === "premium" ? "0.500 HBD" : "0.050 HBD";
    },
    receivingAccount: "your-hive-account",
    facilitatorUrl: "http://localhost:4020",
    description: "Market data feed",
    extra: {
      tiers: { standard: "0.050 HBD", premium: "0.500 HBD" },
      rateLimit: "100 req/min",
    },
  }),
  (req, res) => {
    const tier = (req.query.tier as string) ?? "standard";
    res.json({
      tier,
      data: tier === "premium"
        ? { price: 42.5, volume: 1_000_000, depth: 50 }
        : { price: 42.5 },
      payer: (req as any).payer,
    });
  }
);

// ─── Time-based pricing (e.g. peak hours cost more) ────────────────────────

app.get(
  "/api/compute",
  paywall({
    amount: () => {
      const hour = new Date().getUTCHours();
      const isPeak = hour >= 14 && hour <= 22; // peak: 2pm–10pm UTC
      return isPeak ? "0.200 HBD" : "0.050 HBD";
    },
    receivingAccount: "your-hive-account",
    facilitatorUrl: "http://localhost:4020",
    description: "Compute endpoint — peak pricing 2pm-10pm UTC",
  }),
  (_req, res) => {
    res.json({ result: "computation complete" });
  }
);

const port = parseInt(process.env.PORT ?? "3000", 10);
app.listen(port, () => {
  console.log(`Dynamic pricing server on :${port}`);
  console.log(`  /api/ai?model=basic|advanced|premium`);
  console.log(`  /api/data?tier=standard|premium`);
  console.log(`  /api/compute (time-based pricing)`);
});
