import express, { type Express } from "express";
import type { Client } from "@hiveio/dhive";
import { SqliteNonceStore } from "./store/nonce-store.js";
import { createVerifyRoute } from "./routes/verify.js";
import { createSettleRoute } from "./routes/settle.js";
import { rateLimit, type RateLimitOptions } from "./middleware/rate-limit.js";
import { LANDING_HTML } from "./landing.js";
import type { NonceStore } from "../types.js";
import { HIVE_NETWORK } from "../types.js";

export interface FacilitatorOptions {
  /** Custom NonceStore implementation. Defaults to SQLite. */
  nonceStore?: NonceStore;
  /** SQLite database path (only used if nonceStore not provided). Default: "nonces.db" */
  dbPath?: string;
  /** Optional dhive Client for dependency injection (testing). Falls back to node pool with failover. */
  hiveClient?: Client;
  /** Rate limit options. Set to false to disable. */
  rateLimit?: RateLimitOptions | false;
}

/**
 * Create an Express app that serves the facilitator endpoints:
 *   GET  /health              — health check
 *   GET  /supported-networks  — returns supported networks
 *   POST /verify              — verify a signed payment
 *   POST /settle              — settle (broadcast) a signed payment
 */
export function createFacilitator(options: FacilitatorOptions = {}): Express {
  const nonceStore = options.nonceStore ?? new SqliteNonceStore(options.dbPath);

  const app = express();
  app.use(express.json({ limit: "64kb" }));

  if (options.rateLimit !== false) {
    app.use(rateLimit(options.rateLimit ?? {}));
  }

  app.get("/", (_req, res) => {
    res.type("html").send(LANDING_HTML);
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/supported-networks", (_req, res) => {
    res.json({ networks: [HIVE_NETWORK] });
  });

  app.post("/verify", createVerifyRoute(nonceStore, options.hiveClient));
  app.post("/settle", createSettleRoute(nonceStore, options.hiveClient));

  return app;
}

export { SqliteNonceStore } from "./store/nonce-store.js";
export { RedisNonceStore, type RedisLike, type RedisNonceStoreOptions } from "./store/redis-nonce-store.js";
export { rateLimit, type RateLimitOptions } from "./middleware/rate-limit.js";

// Run standalone if executed directly
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/facilitator/index.ts") ||
    process.argv[1].endsWith("/facilitator/index.js"));

if (isMain) {
  const port = parseInt(process.env.FACILITATOR_PORT ?? "4020", 10);
  const app = createFacilitator();
  app.listen(port, () => {
    console.log(`hive-x402 facilitator listening on :${port}`);
  });
}
