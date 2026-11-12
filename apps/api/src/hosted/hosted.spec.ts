import { createHmac } from "node:crypto";
import { readEvent, verifyWebhook } from "./billing";
import { planOf } from "./plans";
import { assertPublicAddress, isPrivate } from "./safe-fetch";

const body = Buffer.from(JSON.stringify({ event_type: "subscription.updated", data: { id: "sub_1", customer_id: "ctm_1", status: "active",
  custom_data: { householdId: "h1" }, items: [{ price: { id: "pri_family" } }], current_billing_period: { ends_at: "2026-12-04T00:00:00Z" } } }));
const now = Date.parse("2026-11-04T12:00:00Z"), ts = now / 1000;
const sign = (sep: string, t: number, b: Buffer, secret = "whsec") => createHmac("sha256", secret).update(`${t}${sep}`).update(b).digest("hex");

describe("billing webhooks", () => {
  it("accepts a Paddle signature, refuses a forged or stale one", () => {
    expect(verifyWebhook("paddle", "whsec", `ts=${ts};h1=${sign(":", ts, body)}`, body, now)).toMatchObject({ event_type: "subscription.updated" });
    expect(verifyWebhook("paddle", "whsec", `ts=${ts};h1=${sign(":", ts, body, "other")}`, body, now)).toBeNull();
    expect(verifyWebhook("paddle", "whsec", `ts=${ts - 600};h1=${sign(":", ts - 600, body)}`, body, now)).toBeNull();
    expect(verifyWebhook("paddle", "", `ts=${ts};h1=${sign(":", ts, body, "")}`, body, now)).toBeNull();
  });
  it("accepts a Stripe signature", () => {
    expect(verifyWebhook("stripe", "whsec", `t=${ts},v1=${sign(".", ts, body)},v0=x`, body, now)).not.toBeNull();
    expect(verifyWebhook("stripe", "whsec", `t=${ts},v1=${sign(":", ts, body)}`, body, now)).toBeNull();
  });
  it("reads the subscription of the event", () => {
    expect(readEvent("paddle", JSON.parse(body.toString()))).toEqual({ householdId: "h1", subscription: "sub_1", customer: "ctm_1", priceId: "pri_family",
      status: "active", renewsAt: new Date("2026-12-04T00:00:00Z") });
    expect(readEvent("paddle", { event_type: "transaction.completed", data: {} })).toBeNull();
    expect(readEvent("stripe", { type: "customer.subscription.deleted", data: { object: { id: "sub_2", customer: "cus_1", status: "active",
      metadata: { householdId: "h2" }, items: { data: [{ price: { id: "price_x" }, current_period_end: 1796428800 }] } } } }))
      .toMatchObject({ householdId: "h2", status: "canceled", priceId: "price_x", renewsAt: new Date(1796428800000) });
  });
});

describe("plans", () => {
  it("keeps a paid plan while its subscription lives, else free", () => {
    expect(planOf({ plan: "family", planStatus: "active" }).code).toBe("family");
    expect(planOf({ plan: "family", planStatus: "past_due" }).code).toBe("family");
    expect(planOf({ plan: "family", planStatus: "canceled" }).code).toBe("free");
    expect(planOf({ plan: "unknown", planStatus: null }).code).toBe("free");
  });
});

describe("private addresses (hosted mode)", () => {
  it("refuses loopback, private, link-local and shared addresses", () => {
    for (const ip of ["127.0.0.1", "10.20.0.84", "172.20.1.1", "192.168.10.27", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"])
      expect([ip, isPrivate(ip)]).toEqual([ip, true]);
    for (const ip of ["8.8.8.8", "172.32.0.1", "142.250.74.110", "2a00:1450:4007:80e::200e"]) expect([ip, isPrivate(ip)]).toEqual([ip, false]);
    // IPv6 forms that carry an internal IPv4 address (NAT64, 6to4, IPv4-compatible), documentation and discard prefixes
    for (const ip of ["64:ff9b::a00:1", "64:ff9b:1::1", "2002:a00:1::1", "::127.0.0.1", "100::1", "2001:db8::1"]) expect([ip, isPrivate(ip)]).toEqual([ip, true]);
  });
});

describe("recipe addresses given to Mealie (hosted)", () => {
  it("refuses an internal address, accepts a public one", async () => {
    await expect(assertPublicAddress("http://10.20.0.89:9000/api/users")).rejects.toMatchObject({ key: "hosted.privateAddress" });
    await expect(assertPublicAddress("http://[::1]/")).rejects.toMatchObject({ key: "hosted.privateAddress" });
    await expect(assertPublicAddress("file:///etc/passwd")).rejects.toMatchObject({ key: "hosted.privateAddress" });
    await expect(assertPublicAddress("http://93.184.215.14/recipe")).resolves.toBeUndefined();
  });
});
