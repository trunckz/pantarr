// Billing of the hosted offer: Paddle (merchant of record: EU VAT handled by Paddle, recommended) or Stripe. Checkout
// (Paddle.js overlay, or a Stripe Checkout page), management portal, and the webhooks that set the plan of a household.
// Signatures: HMAC-SHA256 of « ts:body » (Paddle-Signature: ts=…;h1=…) or « t.body » (Stripe-Signature: t=…,v1=…).
import { Body, Controller, Get, Headers, Logger, Param, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsString } from "class-validator";
import type { Request } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { AuthUser, CurrentUser, HouseholdAdmin, Public } from "../auth/decorators";
import { config } from "../config";
import { AppError } from "../i18n/i18n";
import { PlanningService } from "../planning/planning.service";
import { PrismaService } from "../prisma/prisma.service";
import { planByPrice, planOf, plans } from "./plans";

class CheckoutDto { @IsString() plan: string }

const TOLERANCE = 300;   // seconds between the signature and its check

function same(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checks the webhook signature of the provider; the event, or null when it does not hold. */
export function verifyWebhook(provider: string, secret: string, header: string, body: Buffer, now = Date.now()): Record<string, unknown> | null {
  if (!secret || !header) return null;
  const parts = Object.fromEntries(header.split(provider === "paddle" ? ";" : ",").map((p) => p.trim().split("=") as [string, string]));
  const ts = provider === "paddle" ? parts.ts : parts.t, sig = provider === "paddle" ? parts.h1 : parts.v1;
  if (!ts || !sig || Math.abs(now / 1000 - Number(ts)) > TOLERANCE) return null;
  const expected = createHmac("sha256", secret).update(`${ts}${provider === "paddle" ? ":" : "."}`).update(body).digest("hex");
  return same(expected, sig) ? JSON.parse(body.toString("utf8")) : null;
}

/** What a webhook event says about a subscription (provider's own words for the status). */
export interface SubscriptionChange { householdId?: string; subscription?: string; customer?: string; priceId?: string; status?: string; renewsAt?: Date }

export function readEvent(provider: string, e: Record<string, any>): SubscriptionChange | null {   // eslint-disable-line @typescript-eslint/no-explicit-any
  if (provider === "paddle") {
    if (!String(e.event_type ?? "").startsWith("subscription.")) return null;
    const d = e.data ?? {};
    return { householdId: d.custom_data?.householdId, subscription: d.id, customer: d.customer_id, priceId: d.items?.[0]?.price?.id, status: d.status,
      renewsAt: d.current_billing_period?.ends_at ? new Date(d.current_billing_period.ends_at) : undefined };
  }
  const o = e.data?.object ?? {};
  if (e.type === "checkout.session.completed") return { householdId: o.client_reference_id, subscription: o.subscription, customer: o.customer };
  if (!String(e.type ?? "").startsWith("customer.subscription.")) return null;
  const end = o.current_period_end ?? o.items?.data?.[0]?.current_period_end;
  return { householdId: o.metadata?.householdId, subscription: o.id, customer: o.customer, priceId: o.items?.data?.[0]?.price?.id,
    status: e.type === "customer.subscription.deleted" ? "canceled" : o.status, renewsAt: end ? new Date(end * 1000) : undefined };
}

const PADDLE_API = () => config.billing.paddleEnvironment === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";

@ApiTags("billing")
@Controller()
export class BillingController {
  private log = new Logger("billing");
  constructor(private prisma: PrismaService, private planning: PlanningService) {}

  private get provider() {
    if (config.mode !== "hosted" || !config.billing.provider) throw new AppError(404, "billing.notConfigured");
    return config.billing.provider;
  }

  /** Plans offered and what the page needs to open the provider's checkout. */
  @Public() @Get("billing/plans")
  offer() {
    return { mode: config.mode, provider: config.billing.provider || null,
      plans: plans().map((p) => ({ code: p.code, name: p.name, price: p.price, llmMonthlyCalls: p.llmMonthlyCalls, maxAccounts: p.maxAccounts, priceId: p.priceId ?? null })),
      paddle: config.billing.provider === "paddle" ? { clientToken: config.billing.paddleClientToken, environment: config.billing.paddleEnvironment } : null };
  }

  @HouseholdAdmin() @Get("households/:id/billing")
  async state(@Param("id") id: string) {
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id } });
    return { plan: planOf(h), subscribed: h.plan, status: h.planStatus, renewsAt: h.planRenewsAt, provider: h.billingProvider,
      accounts: await this.prisma.membership.count({ where: { householdId: id } }), usage: await this.planning.usage(id) };
  }

  @HouseholdAdmin() @Post("households/:id/billing/checkout")
  async checkout(@CurrentUser() me: AuthUser, @Param("id") id: string, @Body() b: CheckoutDto) {
    const provider = this.provider;
    const plan = plans().find((p) => p.code === b.plan && p.priceId);
    if (!plan) throw new AppError(400, "billing.unknownPlan");
    if (provider === "paddle") {
      return { provider, priceId: plan.priceId, customData: { householdId: id }, email: me.email,
        clientToken: config.billing.paddleClientToken, environment: config.billing.paddleEnvironment };
    }
    const form = new URLSearchParams({ mode: "subscription", "line_items[0][price]": plan.priceId!, "line_items[0][quantity]": "1",
      success_url: `${config.baseUrl}/settings/billing?done=1`, cancel_url: `${config.baseUrl}/settings/billing`, client_reference_id: id,
      customer_email: me.email, "subscription_data[metadata][householdId]": id });
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", body: form, signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${config.billing.stripeSecretKey}`, "Content-Type": "application/x-www-form-urlencoded" } });
    if (!r.ok) throw new Error(`Stripe ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return { provider, url: ((await r.json()) as { url: string }).url };
  }

  /** Provider's page to change the payment method, the plan, or cancel. */
  @HouseholdAdmin() @Post("households/:id/billing/portal")
  async portal(@Param("id") id: string) {
    const provider = this.provider;
    const h = await this.prisma.household.findUniqueOrThrow({ where: { id } });
    if (!h.billingCustomer) throw new AppError(404, "billing.notConfigured");
    if (provider === "paddle") {
      const r = await fetch(`${PADDLE_API()}/customers/${h.billingCustomer}/portal-sessions`, { method: "POST", signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${config.billing.paddleApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_ids: h.billingSubscription ? [h.billingSubscription] : [] }) });
      if (!r.ok) throw new Error(`Paddle ${r.status}`);
      return { url: ((await r.json()) as { data: { urls: { general: { overview: string } } } }).data.urls.general.overview };
    }
    const r = await fetch("https://api.stripe.com/v1/billing_portal/sessions", { method: "POST", signal: AbortSignal.timeout(30000),
      body: new URLSearchParams({ customer: h.billingCustomer, return_url: `${config.baseUrl}/settings/billing` }),
      headers: { Authorization: `Bearer ${config.billing.stripeSecretKey}`, "Content-Type": "application/x-www-form-urlencoded" } });
    if (!r.ok) throw new Error(`Stripe ${r.status}`);
    return { url: ((await r.json()) as { url: string }).url };
  }

  /** Webhook of the provider: the plan, status and renewal date of the household follow its subscription. */
  @Public() @Post("billing/webhook")
  async webhook(@Req() req: Request & { rawBody?: Buffer }, @Headers("paddle-signature") paddle?: string, @Headers("stripe-signature") stripe?: string) {
    const provider = this.provider;
    const event = verifyWebhook(provider, config.billing.webhookSecret, (provider === "paddle" ? paddle : stripe) ?? "", req.rawBody ?? Buffer.from(""));
    if (!event) throw new AppError(400, "billing.badSignature");
    const c = readEvent(provider, event);
    if (!c) return { ok: true, ignored: true };
    const h = c.householdId ? await this.prisma.household.findUnique({ where: { id: c.householdId } })
      : c.subscription ? await this.prisma.household.findFirst({ where: { billingSubscription: c.subscription } }) : null;
    if (!h) { this.log.warn(`${provider}: no household for subscription ${c.subscription}`); return { ok: true, ignored: true }; }
    const plan = planByPrice(c.priceId);
    await this.prisma.household.update({ where: { id: h.id }, data: { billingProvider: provider,
      ...(c.customer ? { billingCustomer: c.customer } : {}), ...(c.subscription ? { billingSubscription: c.subscription } : {}),
      ...(plan ? { plan: plan.code } : {}), ...(c.status ? { planStatus: c.status } : {}), ...(c.renewsAt ? { planRenewsAt: c.renewsAt } : {}) } });
    this.log.log(`${provider}: household ${h.id} → ${plan?.code ?? h.plan} (${c.status ?? "?"})`);
    return { ok: true };
  }
}
