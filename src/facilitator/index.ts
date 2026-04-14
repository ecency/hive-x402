import express, { type Express } from "express";
import type { Client } from "@hiveio/dhive";
import { SqliteNonceStore } from "./store/nonce-store.js";
import { createVerifyRoute } from "./routes/verify.js";
import { createSettleRoute } from "./routes/settle.js";
import { rateLimit, type RateLimitOptions } from "./middleware/rate-limit.js";
import { MetricsCollector, metricsMiddleware } from "./middleware/metrics.js";
import { LANDING_HTML } from "./landing.js";
import { STATS_HTML } from "./stats.js";
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
  /** Enable /metrics and /stats endpoints. Default: false (disabled). */
  enableMetrics?: boolean;
  /** Bearer token required to access /metrics and /stats. Also reads METRICS_TOKEN env var. */
  metricsToken?: string;
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
  const metrics = new MetricsCollector();

  const app = express();
  app.use(express.json({ limit: "64kb" }));
  app.use(metricsMiddleware(metrics));

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

  if (options.enableMetrics) {
    const token = options.metricsToken ?? process.env.METRICS_TOKEN;
    const metricsAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (token) {
        const auth = req.headers.authorization;
        if (!auth || auth !== `Bearer ${token}`) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
      }
      next();
    };

    app.get("/metrics", metricsAuth, (_req, res) => {
      res.json(metrics.snapshot());
    });

    app.get("/stats", metricsAuth, (_req, res) => {
      res.type("html").send(STATS_HTML);
    });
  }

  app.post("/verify", createVerifyRoute(nonceStore, options.hiveClient));
  app.post("/settle", createSettleRoute(nonceStore, options.hiveClient, metrics));

  return app;
}

export { SqliteNonceStore } from "./store/nonce-store.js";
export { RedisNonceStore, type RedisLike, type RedisNonceStoreOptions } from "./store/redis-nonce-store.js";
export { rateLimit, type RateLimitOptions } from "./middleware/rate-limit.js";
export { MetricsCollector, type MetricsSnapshot, type SettlementRecord } from "./middleware/metrics.js";

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
