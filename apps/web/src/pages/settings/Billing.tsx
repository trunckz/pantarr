// Billing (hosted mode), for the owners of a household: plan in force and use of the month, subscribe (Paddle overlay
// or Stripe Checkout page), manage the subscription at the provider, accounts of the household and invitations.
import { Alert, Badge, Button, Card, Group, Progress, Select, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Me } from "../../api";
import { useHouseholds } from "../../household";

interface Plan { code: string; name: string; price: string; llmMonthlyCalls: number; maxAccounts: number; priceId: string | null }
interface Offer { provider: "paddle" | "stripe" | null; plans: Plan[]; paddle: { clientToken: string; environment: string } | null }
interface State { plan: Plan; subscribed: string; status: string | null; renewsAt: string | null; accounts: number; usage: { calls: number; limit: number | null } }
interface PaddleJs { Environment: { set(e: string): void }; Initialize(o: { token: string }): void; Checkout: { open(o: object): void } }

/** Paddle.js, loaded once when a subscription is started (cdn.paddle.com, version 2). */
function paddle(token: string, environment: string): Promise<PaddleJs> {
  const w = window as unknown as { Paddle?: PaddleJs };
  if (w.Paddle) return Promise.resolve(w.Paddle);
  return new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    s.onload = () => { if (environment !== "production") w.Paddle!.Environment.set("sandbox"); w.Paddle!.Initialize({ token }); ok(w.Paddle!); };
    s.onerror = ko;
    document.head.appendChild(s);
  });
}

export default function Billing({ me }: { me: Me }) {
  const { t } = useTranslation();
  const h = useHouseholds();
  const owned = me.role === "ADMIN" ? h.list : h.list.filter((x) => x.memberships.some((m) => m.userId === me.id && m.role === "owner"));
  const current = owned.find((x) => x.id === h.current?.id) ?? owned[0] ?? null;
  const offer = useQuery({ queryKey: ["billing-plans"], queryFn: () => api<Offer>("/billing/plans") });
  const state = useQuery({ queryKey: ["billing", current?.id], enabled: !!current, queryFn: () => api<State>(`/households/${current!.id}/billing`) });
  const [invite, setInvite] = useState(""), [role, setRole] = useState("member");
  if (!current) return <Alert>{t("household.none")}</Alert>;
  const fail = (e: unknown) => notifications.show({ color: "red", message: (e as Error).message });
  const subscribe = async (plan: Plan) => {
    try {
      const c = await api<{ provider: string; url?: string; priceId?: string; customData?: object; email?: string; clientToken?: string; environment?: string }>(
        `/households/${current.id}/billing/checkout`, { method: "POST", json: { plan: plan.code } });
      if (c.url) { window.location.href = c.url; return; }
      const p = await paddle(c.clientToken!, c.environment!);
      p.Checkout.open({ items: [{ priceId: c.priceId, quantity: 1 }], customer: { email: c.email }, customData: c.customData,
        settings: { successUrl: `${window.location.origin}/settings/billing?done=1` } });
    } catch (e) { fail(e); }
  };
  const portal = async () => {
    try { window.location.href = (await api<{ url: string }>(`/households/${current.id}/billing/portal`, { method: "POST" })).url; } catch (e) { fail(e); }
  };
  const send = async () => {
    try {
      await api(`/households/${current.id}/invites`, { method: "POST", json: { email: invite, role } });
      setInvite(""); notifications.show({ message: t("billing.invited") });
    } catch (e) { fail(e); }
  };
  const s = state.data, paid = s && s.plan.code !== "free";
  return (
    <Stack maw={980}>
      {new URLSearchParams(window.location.search).get("done") && <Alert color="green">{t("billing.thanks")}</Alert>}
      {s && (
        <Card withBorder>
          <Stack gap="xs">
            <Group justify="space-between">
              <Title order={4}>{t("billing.current", { plan: s.plan.name })}</Title>
              {s.status && <Badge variant="light">{s.status}</Badge>}
            </Group>
            {s.renewsAt && <Text size="sm" c="dimmed">{t("billing.renews", { date: new Date(s.renewsAt).toLocaleDateString() })}</Text>}
            <Text size="sm">{s.usage.limit === null ? t("billing.ownKey", { calls: s.usage.calls }) : t("billing.usage", { calls: s.usage.calls, limit: s.usage.limit })}</Text>
            {s.usage.limit !== null && <Progress value={Math.min(100, (s.usage.calls / Math.max(1, s.usage.limit)) * 100)} />}
            {paid && <Group><Button variant="light" onClick={portal}>{t("billing.manage")}</Button></Group>}
          </Stack>
        </Card>
      )}
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        {(offer.data?.plans ?? []).map((p) => (
          <Card key={p.code} withBorder>
            <Stack gap={6}>
              <Group justify="space-between"><Title order={5}>{p.name}</Title><Text fw={600}>{p.price}</Text></Group>
              <Text size="sm">{t("billing.planCalls", { count: p.llmMonthlyCalls })}</Text>
              <Text size="sm">{t("billing.planAccounts", { count: p.maxAccounts })}</Text>
              {s?.plan.code === p.code
                ? <Badge mt="xs">{t("billing.yours")}</Badge>
                : p.priceId && !paid && <Button mt="xs" onClick={() => subscribe(p)}>{t("billing.subscribe")}</Button>}
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
      {s && (
        <Card withBorder>
          <Stack gap="xs">
            <Title order={5}>{t("billing.accounts", { count: s.accounts, max: s.plan.maxAccounts })}</Title>
            <Text size="sm" c="dimmed">{t("billing.inviteHelp")}</Text>
            <Group align="end">
              <TextInput label={t("common.email")} value={invite} onChange={(e) => setInvite(e.currentTarget.value)} w={280} />
              <Select label={t("billing.role")} data={[{ value: "member", label: t("billing.member") }, { value: "owner", label: t("billing.owner") }]}
                value={role} onChange={(v) => v && setRole(v)} allowDeselect={false} w={180} />
              <Button onClick={send} disabled={!invite.includes("@")}>{t("billing.invite")}</Button>
            </Group>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
