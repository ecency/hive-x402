import type { SignedTransaction, Transaction } from "@hiveio/dhive";

// ─── Constants ───────────────────────────────────────────────────────────────

export const X402_VERSION = 1;
export const HIVE_NETWORK = "hive:mainnet";
export const HBD_ASSET = "HBD";
export const HIVE_CHAIN_ID = Buffer.alloc(32, 0);

export const HEADER_PAYMENT = "x-payment";
export const HEADER_PAYMENT_RESPONSE = "x-payment-response";

export const HIVE_API_NODES = [
  "https://api.hive.blog",
  "https://api.deathwing.me",
  "https://techcoderx.com",
  "https://rpc.ausbit.dev",
  "https://hive-api.arcange.eu",
];

// ─── Payment Protocol Types ─────────────────────────────────────────────────

export interface PaymentRequirements {
  x402Version: number;
  scheme: "exact";
  network: typeof HIVE_NETWORK;
  maxAmountRequired: string;
  resource: string;
  description?: string;
  mimeType?: string;
  payTo: string;
  validBefore: string;
  extra?: Record<string, unknown>;
}

export interface PaymentRequired {
  x402Version: number;
  accepts: PaymentRequirements[];
}

export interface PaymentPayload {
  x402Version: number;
  scheme: "exact";
  network: typeof HIVE_NETWORK;
  payload: {
    signedTransaction: SignedTransaction;
    nonce: string;
  };
}

export interface HiveTransferOp {
  from: string;
  to: string;
  amount: string;
  memo: string;
}

// ─── Facilitator API Types ──────────────────────────────────────────────────

export interface VerifyRequest {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

export interface SettleRequest {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

export interface SettleResponse {
  success: boolean;
  txId?: string;
  blockNum?: number;
  errorReason?: string;
  payer?: string;
}

// ─── Nonce Store ────────────────────────────────────────────────────────────

export interface NonceStore {
  isSpent(nonce: string): boolean | Promise<boolean>;
  markSpent(nonce: string): void | Promise<void>;
}

// ─── Encode / Decode Utilities ──────────────────────────────────────────────

export function encodePayment(payload: PaymentPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function decodePayment(header: string): PaymentPayload {
  return JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
}

export function encodePaymentRequired(pr: PaymentRequired): string {
  return Buffer.from(JSON.stringify(pr)).toString("base64");
}

export function decodePaymentRequired(header: string): PaymentRequired {
  return JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
}

/** Format a number as HBD asset string, e.g. "0.050 HBD" */
export function formatHBD(amount: number): string {
  return `${amount.toFixed(3)} ${HBD_ASSET}`;
}

/** Parse "0.050 HBD" → 0.05 */
export function parseHBD(asset: string): number {
  const match = asset.match(/^(\d+\.\d{3})\s+HBD$/);
  if (!match) throw new Error(`Invalid HBD asset string: ${asset}`);
  return parseFloat(match[1]);
}
