import { createFacilitator } from "./facilitator/index.js";
import { RedisNonceStore } from "./facilitator/store/redis-nonce-store.js";
import { SqliteNonceStore } from "./facilitator/store/nonce-store.js";
import type { NonceStore } from "./types.js";

async function createNonceStore(): Promise<NonceStore> {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const mod = await import("ioredis");
    const Redis = mod.default ?? mod;
    const client = new (Redis as any)(redisUrl);
    console.log(`Nonce store: Redis (${redisUrl})`);
    return new RedisNonceStore({
      client,
      ttlSeconds: parseInt(process.env.NONCE_TTL ?? "86400", 10),
    });
  }

  const dbPath = process.env.SQLITE_PATH ?? "nonces.db";
  console.log(`Nonce store: SQLite (${dbPath})`);
  return new SqliteNonceStore(dbPath);
}

async function main() {
  const nonceStore = await createNonceStore();
  const port = parseInt(process.env.PORT ?? process.env.FACILITATOR_PORT ?? "4020", 10);

  const app = createFacilitator({
    nonceStore,
    rateLimit: {
      max: parseInt(process.env.RATE_LIMIT_MAX ?? "120", 10),
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "60000", 10),
    },
  });

  app.listen(port, "0.0.0.0", () => {
    console.log(`hive-x402 facilitator listening on 0.0.0.0:${port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start facilitator:", err);
  process.exit(1);
});
