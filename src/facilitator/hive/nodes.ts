import { Client } from "@hiveio/dhive";
import { HIVE_API_NODES } from "../../types.js";

const clients = HIVE_API_NODES.map(
  (url) => new Client(url, { timeout: 8000 })
);

let idx = 0;

export function getClient(): Client {
  const client = clients[idx % clients.length];
  idx++;
  return client;
}

/**
 * Try `fn` against each Hive API node in round-robin order.
 * Returns the first successful result, or throws the last error.
 */
export async function withFailover<T>(
  fn: (client: Client) => Promise<T>
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < clients.length; i++) {
    try {
      return await fn(getClient());
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
