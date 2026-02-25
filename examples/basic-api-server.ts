/**
 * Example: API server with a paywalled endpoint.
 *
 * Run the facilitator first:
 *   FACILITATOR_PORT=4020 pnpm dev
 *
 * Then run this server:
 *   npx tsx examples/basic-api-server.ts
 *
 * Test:
 *   curl http://localhost:3000/api/premium  →  402 with payment requirements
 */
import express from "express";
import { paywall } from "../src/middleware/express.js";

const app = express();

// Free endpoint
app.get("/api/free", (_req, res) => {
  res.json({ message: "This is free content!" });
});

// Paywalled endpoint — costs 0.050 HBD
app.get(
  "/api/premium",
  paywall({
    amount: "0.050 HBD",
    receivingAccount: "your-hive-account",
    facilitatorUrl: "http://localhost:4020",
    description: "Premium AI analysis endpoint",
    mimeType: "application/json",
  }),
  (req, res) => {
    res.json({
      message: "Premium content unlocked!",
      payer: (req as any).payer,
      txId: (req as any).txId,
      data: { analysis: "42 is the answer to everything." },
    });
  }
);

const port = parseInt(process.env.PORT ?? "3000", 10);
app.listen(port, () => {
  console.log(`Example API server listening on :${port}`);
  console.log(`  Free:    http://localhost:${port}/api/free`);
  console.log(`  Premium: http://localhost:${port}/api/premium (0.050 HBD)`);
});
