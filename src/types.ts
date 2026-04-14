import type { SignedTransaction, Transaction } from "@hiveio/dhive";

// ─── Constants ───────────────────────────────────────────────────────────────

export const X402_VERSION = 1;
export const X402_VERSION_V2 = 2;
export const HIVE_NETWORK = "hive:mainnet";
export const HBD_ASSET = "HBD";
export const HBD_ASSET_ID = "HBD";

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export const HIVE_CHAIN_ID = hexToBytes(
  "beeab0de00000000000000000000000000000000000000000000000000000000"
);

export const HEADER_PAYMENT = "x-payment";
export const HEADER_PAYMENT_RESPONSE = "x-payment-response";

export const HIVE_API_NODES = [
  "https://api.hive.blog",
  "https://api.deathwing.me",
  "https://techcoderx.com",
  "https://rpc.ausbit.dev",
  "https://hive-api.arcange.eu",
];

// ─── Pricing ────────────────────────────────────────────────────────────────

/**
 * Context passed to dynamic pricing callbacks.
 * Framework-specific request is available via `raw`.
 */
export interface PricingContext<TRaw = unknown> {
  /** The resource path being requested */
  resource: string;
  /** The raw framework request (Express Request, Web Request, Hono Context) */
  raw: TRaw;
}

/** A function that computes the HBD price per-request. */
export type PriceFunction<TRaw = unknown> = (
  ctx: PricingContext<TRaw>,
) => string | Promise<string>;

/** A function that computes extra fields per-request. */
export type ExtraFunction<TRaw = unknown> = (
  ctx: PricingContext<TRaw>,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

// ─── Payment Protocol Types ─────────────────────────────────────────────────

// ── V1 types ────────────────────────────────────────────────────────────────

export interface PaymentRequirementsV1 {
  x402Version: 1;
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

export interface PaymentRequiredV1 {
  x402Version: 1;
  accepts: PaymentRequirementsV1[];
}

export interface PaymentPayloadV1 {
  x402Version: 1;
  scheme: "exact";
  network: typeof HIVE_NETWORK;
  payload: {
    signedTransaction: SignedTransaction;
    nonce: string;
  };
}

// ── V2 types ────────────────────────────────────────────────────────────────

export interface ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;
}

export interface PaymentRequirementsV2 {
  scheme: "exact";
  network: typeof HIVE_NETWORK;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}

export interface PaymentRequiredV2 {
  x402Version: 2;
  error?: string;
  resource: ResourceInfo;
  accepts: PaymentRequirementsV2[];
  extensions?: Record<string, unknown>;
}

export interface PaymentPayloadV2 {
  x402Version: 2;
  accepted: PaymentRequirementsV2;
  resource?: ResourceInfo;
  payload: {
    signedTransaction: SignedTransaction;
    nonce: string;
  };
  extensions?: Record<string, unknown>;
}

// ── Union types ─────────────────────────────────────────────────────────────

export type PaymentRequirements = PaymentRequirementsV1 | PaymentRequirementsV2;
export type PaymentRequired = PaymentRequiredV1 | PaymentRequiredV2;
export type PaymentPayload = PaymentPayloadV1 | PaymentPayloadV2;

// ── Version helpers ─────────────────────────────────────────────────────────

export function isV1Requirements(r: PaymentRequirements): r is PaymentRequirementsV1 {
  return "maxAmountRequired" in r;
}

export function isV1Payload(p: PaymentPayload): p is PaymentPayloadV1 {
  return p.x402Version === 1;
}

export function isV2Payload(p: PaymentPayload): p is PaymentPayloadV2 {
  return p.x402Version === 2;
}

/** Extract the payment amount string from either v1 or v2 PaymentRequirements. */
export function getRequiredAmount(r: PaymentRequirements): string {
  return isV1Requirements(r) ? r.maxAmountRequired : r.amount;
}

/** Extract validBefore from requirements (v1 has it inline, v2 doesn't — returns undefined). */
export function getValidBefore(r: PaymentRequirements): string | undefined {
  return isV1Requirements(r) ? r.validBefore : undefined;
}

/** Extract resource URL from requirements (v1 has it inline, v2 doesn't — returns undefined). */
export function getResourceUrl(r: PaymentRequirements): string | undefined {
  return isV1Requirements(r) ? r.resource : undefined;
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
  /** For v2, validBefore is passed separately since it's not in PaymentRequirementsV2 */
  validBefore?: string;
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

export interface SettleRequest {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  validBefore?: string;
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

// ─── UTF-8–safe Base64 ──────────────────────────────────────────────────────

/** Encode a UTF-8 string to base64 (safe for non-Latin-1 characters). */
export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Decode a base64 string to UTF-8 (safe for non-Latin-1 characters). */
export function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

// ─── Encode / Decode Utilities ──────────────────────────────────────────────

export function encodePayment(payload: PaymentPayload): string {
  return utf8ToBase64(JSON.stringify(payload));
}

export function decodePayment(header: string): PaymentPayload {
  return JSON.parse(base64ToUtf8(header));
}

export function encodePaymentRequired(pr: PaymentRequired): string {
  return utf8ToBase64(JSON.stringify(pr));
}

export function decodePaymentRequired(header: string): PaymentRequired {
  return JSON.parse(base64ToUtf8(header));
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
