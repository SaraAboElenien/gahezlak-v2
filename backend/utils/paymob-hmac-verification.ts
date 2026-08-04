import crypto, { timingSafeEqual } from "crypto";
const PAYMOB_HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET;
const HMAC_KEYS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
];

export function verifyPaymobCallbackHMAC(
  data: unknown,
  receivedHmac: string,
): boolean {
  if (!receivedHmac) {
    return false;
  }
  const concatValues = HMAC_KEYS.map((key) => {
    const parts = key.split(".");
    let value: unknown = data;

    // Walk the dotted path defensively: the payload is attacker-supplied, so
    // any segment may be missing or a non-object.
    for (const part of parts) {
      if (value === null || typeof value !== "object") {
        value = undefined;
        break;
      }
      value = (value as Record<string, unknown>)[part];
      if (value === undefined) break;
    }

    return String(value ?? "");
  }).join("");

  const hmac = crypto
    .createHmac("sha512", PAYMOB_HMAC_SECRET!)
    .update(concatValues)
    .digest("hex");

  const hmacBuffer = Buffer.from(hmac);
  const receivedBuffer = Buffer.from(receivedHmac);

  // timingSafeEqual throws on a length mismatch rather than returning false;
  // receivedHmac is attacker-controlled, so a malformed/wrong-length HMAC
  // must be rejected cleanly instead of crashing into a generic 500.
  if (hmacBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(hmacBuffer, receivedBuffer);
}

/** Only the fields the subscription HMAC is computed over. */
interface PaymobSubscriptionHmacPayload {
  subscription_data?: { id?: number };
  trigger_type?: string;
  hmac?: string;
}

export function verifyPaymobSubscriptionHmac(
  payload: PaymobSubscriptionHmacPayload,
): boolean {
  if (
    !payload.subscription_data?.id ||
    !payload.trigger_type ||
    !payload.hmac
  ) {
    return false;
  }
  const { id } = payload.subscription_data;

  const concatenatedString = `${payload.trigger_type}for${id}`;

  const calculatedHmac = crypto
    .createHmac("sha512", PAYMOB_HMAC_SECRET!)
    .update(concatenatedString)
    .digest("hex");

  const calculatedBuffer = Buffer.from(calculatedHmac);
  const receivedBuffer = Buffer.from(payload.hmac);

  if (calculatedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(calculatedBuffer, receivedBuffer);
}
