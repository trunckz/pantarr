// Plans of the hosted offer (docs/hosted.md): LLM calls per month on the platform's key, accounts
// per household, and the price id of the billing provider. PANTARR_PLANS (JSON list) replaces the default ones.
// A household without an active subscription is on « free ». Self-hosted instances have no plan (no limit but theirs).
import { config } from "../config";

export interface Plan {
  code: string;
  name: string;
  /** Price shown (the billing provider is the reference). */
  price: string;
  /** Calls to the platform's LLM per month (a proposal or a « change »); a household's own key is not counted. */
  llmMonthlyCalls: number;
  /** Accounts (people who sign in) per household. */
  maxAccounts: number;
  /** Price id at the billing provider (Paddle « pri_… », Stripe « price_… »); none for « free ». */
  priceId?: string;
}

export const DEFAULT_PLANS: Plan[] = [
  { code: "free", name: "Free", price: "0", llmMonthlyCalls: 4, maxAccounts: 2 },
  { code: "family", name: "Family", price: "4 €/month", llmMonthlyCalls: 48, maxAccounts: 6 },
  { code: "family-plus", name: "Family+", price: "8 €/month", llmMonthlyCalls: 120, maxAccounts: 10 },
];

export function plans(): Plan[] {
  if (!config.hosted.plans) return DEFAULT_PLANS;
  const list = JSON.parse(config.hosted.plans) as Plan[];
  return list.some((p) => p.code === "free") ? list : [DEFAULT_PLANS[0], ...list];
}

/** Plan in force: the paid one while its subscription is active (or in trial, or just past due), else « free ». */
export function planOf(h: { plan: string; planStatus: string | null }): Plan {
  const all = plans();
  const live = !h.planStatus || ["active", "trialing", "past_due"].includes(h.planStatus);
  return (live && all.find((p) => p.code === h.plan)) || all.find((p) => p.code === "free")!;
}

export const planByPrice = (priceId: string | undefined) => plans().find((p) => p.priceId && p.priceId === priceId);
