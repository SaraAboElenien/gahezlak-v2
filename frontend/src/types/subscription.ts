export type SubscriptionStatus =
  "trialing" | "active" | "pending" | "cancelled" | "expired";

export interface Subscription {
  _id: string;
  userId: string;
  shop: string;
  plan: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}
