/**
 * Example: AI agent client that pays for premium API endpoints with HBD.
 *
 * Prerequisites:
 *   1. Facilitator running:  FACILITATOR_PORT=4020 pnpm dev
 *   2. API server running:   npx tsx examples/basic-api-server.ts
 *
 * Run:
 *   HIVE_ACCOUNT=youraccount HIVE_ACTIVE_KEY=5K... npx tsx examples/ai-agent-client.ts
 */
import { HiveX402Client } from "../src/client/index.js";

const account = process.env.HIVE_ACCOUNT;
const activeKey = process.env.HIVE_ACTIVE_KEY;

if (!account || !activeKey) {
  console.error("Set HIVE_ACCOUNT and HIVE_ACTIVE_KEY environment variables");
  process.exit(1);
}

const client = new HiveX402Client({
  account,
  activeKey,
  maxPayment: 0.1, // max 0.100 HBD per request
});

async function main() {
  console.log("Fetching premium endpoint...");

  const response = await client.fetch("http://localhost:3000/api/premium");
  const data = await response.json();

  console.log("Response:", JSON.stringify(data, null, 2));
  console.log("Status:", response.status);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
