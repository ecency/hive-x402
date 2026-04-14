import {
  HEADER_PAYMENT,
  HIVE_NETWORK,
  decodePaymentRequired,
  type PaymentRequired,
  type PaymentRequirements,
  type PaymentRequiredV2,
  type ResourceInfo,
} from "../types.js";

export interface ParsedRequirements {
  requirements: PaymentRequirements | null;
  x402Version: 1 | 2;
  resource?: ResourceInfo;
}

/**
 * Parse the 402 response to extract Hive payment requirements.
 * Returns the first matching Hive requirement, detected version, and resource info.
 */
export function parseRequirements(response: Response): ParsedRequirements {
  const header = response.headers.get(HEADER_PAYMENT);
  if (!header) return { requirements: null, x402Version: 1 };

  const paymentRequired: PaymentRequired = decodePaymentRequired(header);
  const version = (paymentRequired.x402Version === 2 ? 2 : 1) as 1 | 2;

  const match = paymentRequired.accepts.find((r) => r.network === HIVE_NETWORK) ?? null;

  const resource = version === 2 ? (paymentRequired as PaymentRequiredV2).resource : undefined;

  return { requirements: match, x402Version: version, resource };
}
