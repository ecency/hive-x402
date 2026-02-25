# @hiveio/x402

Hive/HBD-native implementation of the [x402 payment standard](https://www.x402.org/). Enables HTTP 402 micropayments using Hive's zero-fee stablecoin **HBD** (Hive Backed Dollars).

## How it works

```
Client                    API Server                Facilitator          Hive
  |  GET /premium           |                          |                  |
  |------------------------>|                          |                  |
  |  402 + x-payment header |                          |                  |
  |<------------------------|                          |                  |
  |  sign HBD transfer      |                          |                  |
  |  GET /premium + x-payment                          |                  |
  |------------------------>|  POST /verify            |                  |
  |                         |------------------------->|  verify sig      |
  |                         |  { isValid: true }       |----------------->|
  |                         |<-------------------------|                  |
  |                         |  POST /settle            |                  |
  |                         |------------------------->|  broadcast tx    |
  |                         |  { success, txId }       |----------------->|
  |                         |<-------------------------|                  |
  |  200 + resource data    |                          |                  |
  |<------------------------|                          |                  |
```

## Install

```bash
npm install @hiveio/x402
```

## Quick start

### 1. Start the facilitator

```ts
import { createFacilitator } from "@hiveio/x402/facilitator";

const app = createFacilitator();
app.listen(4020);
```

### 2. Add paywall to your API (Express)

```ts
import express from "express";
import { paywall } from "@hiveio/x402/middleware";

const app = express();

app.get("/api/premium", paywall({
  amount: "0.050 HBD",
  receivingAccount: "your-hive-account",
  facilitatorUrl: "http://localhost:4020",
}), (req, res) => {
  res.json({ data: "premium content", payer: req.payer });
});

app.listen(3000);
```

### 3. Add paywall to your API (Next.js App Router)

```ts
// app/api/premium/route.ts
import { withPaywall } from "@hiveio/x402/middleware/nextjs";

async function handler(req: Request, ctx: { payer: string; txId: string }) {
  return Response.json({ data: "premium content", payer: ctx.payer });
}

export const GET = withPaywall({
  amount: "0.050 HBD",
  receivingAccount: "your-hive-account",
  facilitatorUrl: "http://localhost:4020",
}, handler);
```

### 4. Pay for content (AI agent / client)

```ts
import { HiveX402Client } from "@hiveio/x402/client";

const client = new HiveX402Client({
  account: "alice",
  activeKey: "5K...",    // Hive active private key (WIF)
  maxPayment: 0.1,       // max HBD per request
});

const res = await client.fetch("http://localhost:3000/api/premium");
const data = await res.json();
```

## Subpath exports

| Import | Description |
|--------|-------------|
| `@hiveio/x402/types` | Constants, types, encode/decode utilities |
| `@hiveio/x402/facilitator` | Facilitator service (verify + settle + nonce stores) |
| `@hiveio/x402/client` | `HiveX402Client` fetch wrapper for paying agents |
| `@hiveio/x402/middleware` | Express `paywall()` middleware |
| `@hiveio/x402/middleware/nextjs` | Next.js `withPaywall()` route wrapper |

## Facilitator

The facilitator verifies secp256k1 signatures against Hive accounts' on-chain active public keys and broadcasts HBD transfers.

```ts
import { createFacilitator } from "@hiveio/x402/facilitator";

const app = createFacilitator({
  // All options are optional:
  dbPath: "nonces.db",           // SQLite path (default)
  nonceStore: customStore,       // or provide your own NonceStore
  rateLimit: { max: 60, windowMs: 60_000 },  // rate limiting (enabled by default)
});
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/supported-networks` | Returns `["hive:mainnet"]` |
| POST | `/verify` | Verify a signed payment |
| POST | `/settle` | Verify + broadcast + mark nonce spent |

### Nonce stores

**SQLite** (default, zero-config):
```ts
import { SqliteNonceStore } from "@hiveio/x402/facilitator";
const store = new SqliteNonceStore("nonces.db"); // or ":memory:"
```

**Redis** (production):
```ts
import { RedisNonceStore } from "@hiveio/x402/facilitator";
import Redis from "ioredis";

const store = new RedisNonceStore({
  client: new Redis(),
  prefix: "x402:nonce:",    // default
  ttlSeconds: 86400,        // default: 24 hours
});
```

## Client

```ts
import { HiveX402Client } from "@hiveio/x402/client";

const client = new HiveX402Client({
  account: "alice",
  activeKey: "5K...",
  maxPayment: 1.0,  // max HBD per request (default: 1.000)
});

// Transparently handles 402 → sign → retry
const response = await client.fetch("https://api.example.com/premium");
```

### Lower-level API

```ts
import { signPayment, parseRequirements } from "@hiveio/x402/client";

// Parse requirements from a 402 response
const requirements = parseRequirements(response);

// Sign a payment (returns base64-encoded x-payment header value)
const header = await signPayment({
  account: "alice",
  activeKey: "5K...",
  requirements,
});
```

## Types

```ts
import type {
  PaymentRequirements,
  PaymentRequired,
  PaymentPayload,
  VerifyRequest,
  VerifyResponse,
  SettleRequest,
  SettleResponse,
  NonceStore,
} from "@hiveio/x402/types";

import {
  encodePayment,
  decodePayment,
  formatHBD,     // formatHBD(0.05) → "0.050 HBD"
  parseHBD,      // parseHBD("0.050 HBD") → 0.05
  X402_VERSION,  // 1
  HIVE_NETWORK,  // "hive:mainnet"
} from "@hiveio/x402/types";
```

## Why Hive + HBD?

- **Zero fees**: Hive has no transaction fees — every micropayment arrives in full
- **3-second finality**: Blocks every 3 seconds, no waiting for confirmations
- **Stable value**: HBD is an algorithmic stablecoin pegged to $1 USD
- **Built-in accounts**: Human-readable account names (no hex addresses)
- **Battle-tested**: Hive has processed billions of transactions since 2016

## License

MIT
