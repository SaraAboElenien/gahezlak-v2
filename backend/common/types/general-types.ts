import { JwtPayload } from "jsonwebtoken";

export type LangType = "en" | "ar";
export type MessageError = { en: string; ar: string };
export type CurrentUserPayload = JwtPayload & {
  userId: string;
  email: string;
  role: string;
  shopId: string;
};

interface PaymobClientInfo {
  email: string;
  full_name: string;
  phone_number: string;
}

interface PaymobCardData {
  token: string;
  masked_pan: string;
}

interface PaymobSubscriptionData {
  id: number;
  client_info: PaymobClientInfo;
  frequency: number;
  created_at: string;
  updated_at: string;
  name: string;
  reminder_days: number | null;
  retrial_days: number | null;
  plan_id: number;
  state: "active" | "pending" | "cancelled" | "expired";
  amount_cents: number;
  starts_at: string;
  next_billing: string;
  reminder_date: string | null;
  ends_at: string | null;
  resumed_at: string | null;
  suspended_at: string | null;
  reactivated_at: string | null;
  webhook_url: string;
  integration: number;
  initial_transaction: number;
}

export interface PaymobWebhookPayload {
  subscription_data: PaymobSubscriptionData;
  transaction_id: number;
  trigger_type:
    | "Subscription Created"
    | "Subscription Activated"
    | "Subscription Cancelled"
    | "Subscription Expired"
    | "Subscription Renewed";
  hmac: string;
  paymob_request_id: string;
  card_data: PaymobCardData;
}
