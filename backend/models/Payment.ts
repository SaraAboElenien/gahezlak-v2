// This used to also define a `Payment` Mongoose model/schema (plus
// `PaymentStatus`/`IPayment`) for an earlier mock-payment implementation.
// That model had zero real consumers — the live Paymob-backed payment flow
// tracks state directly on `Order`/`Subscription` instead — and was removed
// as dead code (see TECH_DEBT.md). `PaymentMethods` is kept: it's a real,
// live enum used by `controllers/payment.webhook.controller.ts` and
// `validators/order.validator.ts`.
export enum PaymentMethods {
  CreditCard = "CreditCard",
  DebitCard = "DebitCard",
  VodafoneCash = "VodafoneCash",
  OrangeMoney = "OrangeMoney",
  EtisalatWallet = "EtisalatWallet",
  Fawry = "Fawry",
  BankTransfer = "BankTransfer",
  Cash = "Cash",
}
