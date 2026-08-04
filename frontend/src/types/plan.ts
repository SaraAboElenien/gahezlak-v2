export type PlanFrequency = "monthly" | "yearly";
export type PlanCurrency = "EGP" | "USD";

export interface Plan {
  _id: string;
  planGroup: string;
  title: string;
  description: string;
  frequency: PlanFrequency;
  currency: PlanCurrency;
  price: number;
  features: string[];
  trialPeriodDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
