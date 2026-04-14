import { HEADER_PAYMENT, getRequiredAmount, parseHBD } from "../types.js";
import { parseRequirements } from "./parse-requirements.js";
import { signPayment } from "./sign-payment.js";

export interface HiveX402ClientOptions {
  /** Hive account name */
  account: string;
  /** Active private key in WIF format */
  activeKey: string;
  /** Maximum amount (in HBD) the client is willing to pay per request. Default: 1.000 */
  maxPayment?: number;
}

/**
 * A fetch wrapper that transparently handles HTTP 402 payment flows
 * using Hive HBD transfers.
 *
 * Usage:
 *   const client = new HiveX402Client({ account: "alice", activeKey: "5K..." });
 *   const res = await client.fetch("https://api.example.com/premium");
 */
export class HiveX402Client {
  private account: string;
  private activeKey: string;
  private maxPayment: number;

  constructor(options: HiveX402ClientOptions) {
    this.account = options.account;
    this.activeKey = options.activeKey;
    this.maxPayment = options.maxPayment ?? 1.0;
  }

  async fetch(url: string | URL, init?: RequestInit): Promise<Response> {
    // First attempt
    const response = await globalThis.fetch(url, init);

    if (response.status !== 402) {
      return response;
    }

    // Parse Hive payment requirements from 402 response
    const { requirements, x402Version, resource } = parseRequirements(response);
    if (!requirements) {
      throw new Error("Received 402 but no Hive payment requirements found");
    }

    // Check against max payment threshold
    const amountStr = getRequiredAmount(requirements);
    const amount = parseHBD(amountStr);
    if (amount > this.maxPayment) {
      throw new Error(
        `Payment of ${amountStr} exceeds max allowed ${this.maxPayment.toFixed(3)} HBD`
      );
    }

    // Sign the payment
    const paymentHeader = await signPayment({
      account: this.account,
      activeKey: this.activeKey,
      requirements,
      x402Version,
      resource,
    });

    // Retry with payment header
    const headers = new Headers(init?.headers);
    headers.set(HEADER_PAYMENT, paymentHeader);

    return globalThis.fetch(url, { ...init, headers });
  }
}
