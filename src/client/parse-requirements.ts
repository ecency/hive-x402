import {
  HEADER_PAYMENT,
  HIVE_NETWORK,
  decodePaymentRequired,
  type PaymentRequired,
  type PaymentRequirements,
} from "../types.js";

/**
 * Parse the 402 response to extract Hive payment requirements.
 * Returns the first `PaymentRequirements` entry that targets the Hive network,
 * or null if no Hive requirement is found.
 */
export function parseRequirements(response: Response): PaymentRequirements | null {
  const header = response.headers.get(HEADER_PAYMENT);
  if (!header) return null;

  const paymentRequired: PaymentRequired = decodePaymentRequired(header);

  return (
    paymentRequired.accepts.find((r) => r.network === HIVE_NETWORK) ?? null
  );
}
