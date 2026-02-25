import type { Client, SignedTransaction, TransactionConfirmation } from "@hiveio/dhive";
import { withFailover } from "./nodes.js";

export interface BroadcastOptions {
  /** Optional dhive Client for dependency injection (testing). Falls back to node pool. */
  client?: Client;
}

/**
 * Broadcast a signed transaction to the Hive network with failover across API nodes.
 */
export async function broadcastTransaction(
  signedTx: SignedTransaction,
  options: BroadcastOptions = {}
): Promise<TransactionConfirmation> {
  if (options.client) {
    return options.client.broadcast.send(signedTx);
  }
  return withFailover((client) => client.broadcast.send(signedTx));
}
