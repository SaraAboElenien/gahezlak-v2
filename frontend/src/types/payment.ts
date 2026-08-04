export type PaymentMethod =
  | "CreditCard"
  | "DebitCard"
  | "VodafoneCash"
  | "OrangeMoney"
  | "EtisalatWallet"
  | "Fawry"
  | "BankTransfer"
  | "Cash";

export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

export interface GuestInfo {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
}

export interface Payment {
  _id: string;
  userId?: string;
  planId?: string;
  shopId?: string;
  orderId?: string;
  guestInfo?: GuestInfo;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amount: number;
  createdAt: string;
  updatedAt: string;
}
