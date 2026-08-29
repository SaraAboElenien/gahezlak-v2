import { Types } from "mongoose";
import {
  IPaymentTransaction,
  PaymentTransactions,
} from "../models/PaymentTransaction";
import { logger } from "../config/pino";

/** Everything the caller must supply; the rest is defaulted or derived. */
type SettledTransactionInput = Pick<
  IPaymentTransaction,
  "kind" | "shopId" | "amount" | "paymobTransactionId" | "settledAt"
> &
  Partial<
    Pick<
      IPaymentTransaction,
      "subscriptionId" | "planId" | "orderId" | "currency"
    >
  >;

/**
 * Append one settled charge to the ledger.
 *
 * TWO PROPERTIES MATTER HERE, and both are about failure rather than success.
 *
 * **It is idempotent.** Paymob retries any webhook it did not receive a 200
 * for, so the same transaction can arrive more than once. `paymobTransactionId`
 * is uniquely indexed and a duplicate is swallowed as a no-op. Without that, a
 * single retried renewal would silently inflate reported revenue, and nothing
 * downstream could distinguish the duplicate row from a real second charge.
 *
 * **It never throws.** The caller is a webhook handler that has already moved
 * real state — a subscription activated, an order confirmed — in response to
 * money that has already changed hands. The ledger is derived reporting; the
 * authoritative record lives at Paymob. Letting a reporting insert fail a
 * webhook would mean Paymob retries the whole handler, and those handlers are
 * not all idempotent (`handleTransactionProcessed` stamps
 * `currentPeriodStart = new Date()`). Taking a paid-up restaurant's activation
 * down to protect a reporting row is the wrong trade, and it is the same
 * deny-direction mistake this codebase has already shipped once.
 *
 * The cost of that choice is that a failed insert loses revenue data silently
 * unless someone reads the log, so the failure is logged at `error` with the
 * full context needed to reconstruct the row by hand.
 */
export async function recordSettledTransaction(
  input: SettledTransactionInput,
): Promise<void> {
  try {
    await PaymentTransactions.create({ currency: "EGP", ...input });
    logger.info(
      `Ledger: recorded ${input.kind} of ${input.amount} for shop ${String(
        input.shopId,
      )} (Paymob txn ${input.paymobTransactionId}).`,
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      // A redelivered webhook. Expected, and not a problem.
      logger.info(
        `Ledger: Paymob txn ${input.paymobTransactionId} already recorded; ignoring redelivery.`,
      );
      return;
    }
    logger.error(
      `Ledger: FAILED to record ${input.kind} of ${input.amount} for shop ${String(
        input.shopId,
      )} (Paymob txn ${input.paymobTransactionId}). Revenue reporting will be short by this amount until it is inserted by hand.`,
      error,
    );
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

/** Narrow a possibly-populated ref down to the id, for storing on the ledger. */
export function toRefId(value: unknown): Types.ObjectId | undefined {
  if (!value) return undefined;
  if (typeof value === "object" && "_id" in value) {
    return (value as { _id: Types.ObjectId })._id;
  }
  return value as Types.ObjectId;
}
