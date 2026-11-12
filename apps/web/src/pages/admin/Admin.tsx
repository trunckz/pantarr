// Platform administration (role ADMIN): the site at a glance, households with their plan and quota (used / available),
// accounts, invitation codes of the beta.
import { ActionIcon, Alert, Badge, Button, Card, CopyButton, Group, NumberInput, Popover, Progress, ScrollArea, Select, SimpleGrid, Stack, Switch, Table, Tabs, Text,
  TextInput, Title, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconCopy, IconTrash } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";
import { InstanceConnectors } from "../settings/Connectors";
import General from "../settings/General";
import Sso from "../settings/Sso";
import Users from "../settings/Users";
import { useSimple } from "../../simple";

interface Overview {
  site: { version: string; mode: string; signup: string; baseUrl: string; uptimeSeconds: number; memoryMb: number; databaseMb: number; mail: boolean;
    mealie: string; platformLlm: string | null; billing: string | null; plans: { code: string; name: string; llmMonthlyCalls: number; maxAccounts: number }[] };
  accounts: { total: number; verified: number; disabled: number; admins: number; signups7: number; signups30: number; active7: number };
  households: { total: number; withOwnLlm: number; mealieProvisioned: number; byPlan: Record<string, number> };
  llm: { since: string; calls: number; failed: number; inputTokens: number; outputTokens: number; byPurpose: Record<string, number>;
    byConnector: { connector: string; calls: number; tokens: number }[]; daily: { day: string; calls: number; tokens: number }[] };
  data: { receipts: number; receiptsMb: number; receiptStatus: Record<string, number>; receiptSource: Record<string, number>; products: number; purchases: number; drafts: number };
  jobs: { running: number; failed24h: number; lastErrors: { kind: string; error: string | null; at: string; household: string | null }[] };
  codes: { total: number; uses: number; capacity: number };
}
interface Household { id: string; name: string; createdAt: string; locale: string; owners: string[]; accounts: number; people: number; plan: string; planWanted: string; planStatus: string | null;
  quotaOverride: number | null; quota: { used: number; limit: number | null; tokens: number }; ownLlm: boolean; connectors: string[]; mealieGroup: boolean;
  receipts: number; drafts: number; products: number; lastActivity: string; code: { code: string; label: string } | null }
interface User { id: string; email: string; name: string; role: "ADMIN" | "USER"; disabled: boolean; createdAt: string; lastLoginAt: string | null; emailVerifiedAt: string | null;
  sso: boolean; households: { id: string; name: string; role: string }[] }
interface Code { id: string; code: string; label: string; plan: string | null; maxUses: number; uses: number; expiresAt: string | null; disabled: boolean; createdAt: string }

const fail = (e: unknown) => notifications.show({ color: "red", message: (e as Error).message });

export default function Admin() {
  const { t } = useTranslation();
  const tab = useParams()["*"] || "overview";
  const go = useNavigate();
  // the instance's connectors: Mealie, LLM (and the document manager when self-hosted) ; general settings (default
  // language, sign-up) ; single sign-on of an organisation: self-hosted only
  const simple = useSimple();
  // by use: the state of the site, then helping people (accounts), households and subscriptions, invitations ; the
  // services and the site's settings, rarely changed, last
  const tabs = ["overview", "users", "households", "codes", "connectors", "general", ...(simple ? [] : ["sso"])];
  return (
    <Stack>
      <Title order={2}>{t("admin.title")}</Title>
      <Tabs value={tab} onChange={(v) => go(`/admin/${v}`)} keepMounted={false}>
        <ScrollArea type="never"><Tabs.List style={{ flexWrap: "nowrap" }} mb="md">
          {tabs.map((x) => <Tabs.Tab key={x} value={x}>{t(`admin.tab.${x}`)}</Tabs.Tab>)}
        </Tabs.List></ScrollArea>
        <Tabs.Panel value="overview"><OverviewTab /></Tabs.Panel>
        <Tabs.Panel value="households"><HouseholdsTab /></Tabs.Panel>
        {/* self-hosted: the accounts are created and managed here (no sign-up) */}
        <Tabs.Panel value="users">{simple ? <UsersTab /> : <Users />}</Tabs.Panel>
        <Tabs.Panel value="general"><General /></Tabs.Panel>
        {!simple && <Tabs.Panel value="sso"><Sso /></Tabs.Panel>}
        <Tabs.Panel value="codes"><CodesTab /></Tabs.Panel>
        {tabs.includes("connectors") && <Tabs.Panel value="connectors"><InstanceConnectors /></Tabs.Panel>}
      </Tabs>
    </Stack>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card withBorder padding="sm">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      <Text fw={700} size="xl" style={{ fontVariantNumeric: "tabular-nums" }}>{value}</Text>
      {hint && <Text size="xs" c="dimmed">{hint}</Text>}
    </Card>
  );
}

const dur = (s: number) => (s > 86400 ? `${Math.floor(s / 86400)} j ${Math.floor((s % 86400) / 3600)} h` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`);
const pairs = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(" · ") || "—";

function OverviewTab() {
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: ["admin-overview"], queryFn: () => api<Overview>("/admin/overview"), refetchInterval: 60000 });
  if (q.error) return <Alert color="red">{(q.error as Error).message}</Alert>;
  const o = q.data;
  if (!o) return null;
  const max = Math.max(1, ...o.llm.daily.map((d) => d.calls));
  const ok = (good: boolean, text: string) => <Badge color={good ? "green" : "red"} variant="light">{text}</Badge>;
  return (
    <Stack>
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
        <Stat label={t("admin.o.accounts")} value={o.accounts.total} hint={t("admin.o.accountsHint", { ...o.accounts })} />
        <Stat label={t("admin.o.households")} value={o.households.total} hint={pairs(o.households.byPlan)} />
        <Stat label={t("admin.o.llmCalls")} value={o.llm.calls} hint={t("admin.o.llmHint", { failed: o.llm.failed, since: o.llm.since })} />
        <Stat label={t("admin.o.tokens")} value={((o.llm.inputTokens + o.llm.outputTokens) / 1000).toFixed(0) + " k"} hint={t("admin.o.tokensHint", { input: Math.round(o.llm.inputTokens / 1000), output: Math.round(o.llm.outputTokens / 1000) })} />
        <Stat label={t("admin.o.receipts")} value={o.data.receipts} hint={`${o.data.receiptsMb} Mo · ${pairs(o.data.receiptStatus)}`} />
        <Stat label={t("admin.o.jobs")} value={o.jobs.failed24h} hint={t("admin.o.jobsHint", { running: o.jobs.running })} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder>
          <Text fw={600} mb="xs">{t("admin.o.daily")}</Text>
          {o.llm.daily.length ? (
            <svg viewBox={`0 0 ${o.llm.daily.length * 12} 80`} width="100%" height={110} preserveAspectRatio="none" role="img" aria-label={t("admin.o.daily")}>
              {o.llm.daily.map((d, i) => <rect key={d.day} x={i * 12 + 1} y={80 - (d.calls / max) * 76} width={10} height={(d.calls / max) * 76} rx={1.5}
                fill="var(--mantine-primary-color-filled)"><title>{`${d.day} : ${d.calls} · ${Math.round(d.tokens / 1000)} k tokens`}</title></rect>)}
            </svg>) : <Text c="dimmed" size="sm">{t("admin.o.noCalls")}</Text>}
          <Text size="xs" c="dimmed" mt={4}>{t("admin.o.byPurpose")} : {pairs(o.llm.byPurpose)}</Text>
          <Text size="xs" c="dimmed">{t("admin.o.byConnector")} : {o.llm.byConnector.map((c) => `${c.connector} ${c.calls} (${Math.round(c.tokens / 1000)} k)`).join(" · ") || "—"}</Text>
        </Card>
        <Card withBorder>
          <Text fw={600} mb="xs">{t("admin.o.site")}</Text>
          <Stack gap={6}>
            <Group gap="xs">{ok(o.site.mail, t("admin.o.mail"))}{ok(o.site.mealie === "ok", `Mealie : ${o.site.mealie}`)}{ok(!!o.site.platformLlm, `LLM : ${o.site.platformLlm ?? "—"}`)}
              <Badge variant="outline">{t("admin.o.signup")} : {o.site.signup}</Badge><Badge variant="outline">{t("admin.o.billing")} : {o.site.billing ?? "—"}</Badge></Group>
            <Text size="sm">{o.site.baseUrl} · v{o.site.version} · {o.site.mode}</Text>
            <Text size="sm" c="dimmed">{t("admin.o.uptime")} {dur(o.site.uptimeSeconds)} · {o.site.memoryMb} Mo RAM · {t("admin.o.database")} {o.site.databaseMb} Mo</Text>
            <Text size="sm" c="dimmed">{t("admin.o.data", { ...o.data })}</Text>
            <Text size="sm" c="dimmed">{t("admin.o.codes", { ...o.codes })} · {t("admin.o.mealieGroups", { count: o.households.mealieProvisioned })} · {t("admin.o.ownLlm", { count: o.households.withOwnLlm })}</Text>
            <Text size="sm" c="dimmed">{t("admin.o.plans")} : {o.site.plans.map((p) => `${p.name} (${p.llmMonthlyCalls}/${t("admin.o.month")}, ${p.maxAccounts} ${t("admin.o.acc")})`).join(" · ")}</Text>
          </Stack>
        </Card>
      </SimpleGrid>
      <Card withBorder>
        <Text fw={600} mb="xs">{t("admin.o.errors")}</Text>
        {!o.jobs.lastErrors.length && <Text c="dimmed" size="sm">{t("admin.o.noErrors")}</Text>}
        <ScrollArea><Table fz="sm" verticalSpacing={4}><Table.Tbody>
          {o.jobs.lastErrors.map((e, i) => (
            <Table.Tr key={i}><Table.Td style={{ whiteSpace: "nowrap" }}>{new Date(e.at).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" })}</Table.Td>
              <Table.Td>{e.kind}</Table.Td><Table.Td>{e.household ?? "—"}</Table.Td><Table.Td c="red">{e.error}</Table.Td></Table.Tr>
          ))}
        </Table.Tbody></Table></ScrollArea>
      </Card>
    </Stack>
  );
}

function HouseholdsTab() {
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: ["admin-households"], queryFn: () => api<Household[]>("/admin/households") });
  const o = useQuery({ queryKey: ["admin-overview"], queryFn: () => api<Overview>("/admin/overview") });
  const [filter, setFilter] = useState("");
  const patch = async (id: string, b: object) => { try { await api(`/admin/households/${id}`, { method: "PATCH", json: b }); await q.refetch(); } catch (e) { fail(e); } };
  if (q.error) return <Alert color="red">{(q.error as Error).message}</Alert>;
  const list = (q.data ?? []).filter((h) => !filter || `${h.name} ${h.owners.join(" ")}`.toLowerCase().includes(filter.toLowerCase()));
  const plans = (o.data?.site.plans ?? []).map((p) => ({ value: p.code, label: p.name }));
  const day = (x: string) => new Date(x).toLocaleDateString(i18n.language, { day: "numeric", month: "short" });
  return (
    <Stack>
      <TextInput placeholder={t("admin.search")} value={filter} onChange={(e) => setFilter(e.currentTarget.value)} maw={360} />
      <ScrollArea type="auto">
        <Table striped highlightOnHover miw={1050} fz="sm">
          <Table.Thead><Table.Tr>
            {["household", "owners", "accounts", "plan", "quota", "tokens", "data", "activity", "code"].map((c) => <Table.Th key={c}>{t(`admin.h.${c}`)}</Table.Th>)}
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {list.map((h) => {
              const pct = h.quota.limit ? Math.min(100, (h.quota.used / h.quota.limit) * 100) : 0;
              return (
                <Table.Tr key={h.id}>
                  <Table.Td><Text fw={500} size="sm">{h.name}</Text><Text size="xs" c="dimmed">{day(h.createdAt)} · {h.locale}{h.mealieGroup ? "" : ` · ${t("admin.h.noMealie")}`}</Text></Table.Td>
                  <Table.Td>{h.owners.map((x) => <Text key={x} size="xs">{x}</Text>)}</Table.Td>
                  <Table.Td>{h.accounts} / {h.people}</Table.Td>
                  <Table.Td><Select size="xs" w={120} data={plans} value={h.planWanted} allowDeselect={false} onChange={(v) => v && v !== h.planWanted && patch(h.id, { plan: v })} />
                    {h.planStatus && <Text size="xs" c="dimmed">{h.planStatus}</Text>}</Table.Td>
                  <Table.Td miw={150}>
                    <Group gap={4} wrap="nowrap">
                      <Text size="sm" style={{ fontVariantNumeric: "tabular-nums" }}>{h.quota.used} / {h.ownLlm ? "∞" : h.quota.limit ?? "∞"}</Text>
                      <QuotaEdit value={h.quotaOverride} onSave={(v) => patch(h.id, { quotaOverride: v })} />
                    </Group>
                    {!h.ownLlm && h.quota.limit ? <Progress size="sm" value={pct} color={pct >= 100 ? "red" : pct >= 80 ? "orange" : "green"} /> : null}
                    {h.ownLlm && <Text size="xs" c="dimmed">{t("admin.h.ownLlm")}</Text>}
                    {h.quotaOverride !== null && <Text size="xs" c="blue">{t("admin.h.override", { count: h.quotaOverride })}</Text>}
                  </Table.Td>
                  <Table.Td>{Math.round(h.quota.tokens / 1000)} k</Table.Td>
                  <Table.Td><Text size="xs">{t("admin.h.dataLine", { drafts: h.drafts, receipts: h.receipts, products: h.products })}</Text></Table.Td>
                  <Table.Td>{day(h.lastActivity)}</Table.Td>
                  <Table.Td>{h.code ? <Tooltip label={h.code.label || h.code.code}><Badge variant="light">{h.code.code}</Badge></Tooltip> : "—"}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}

function QuotaEdit({ value, onSave }: { value: number | null; onSave: (v: number | null) => void }) {
  const { t } = useTranslation();
  const [v, setV] = useState<number | string>(value ?? "");
  return (
    <Popover withArrow>
      <Popover.Target><Button size="compact-xs" variant="subtle">{t("admin.h.edit")}</Button></Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <NumberInput label={t("admin.h.quotaLabel")} description={t("admin.h.quotaHelp")} min={0} value={v} onChange={setV} w={220} />
          <Group gap="xs"><Button size="xs" onClick={() => onSave(v === "" ? null : Number(v))}>{t("common.save")}</Button>
            {value !== null && <Button size="xs" variant="subtle" onClick={() => onSave(null)}>{t("admin.h.backToPlan")}</Button>}</Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

function UsersTab() {
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: ["admin-users"], queryFn: () => api<User[]>("/admin/users") });
  const [filter, setFilter] = useState("");
  const patch = async (id: string, b: object) => { try { await api(`/admin/users/${id}`, { method: "PATCH", json: b }); await q.refetch(); } catch (e) { fail(e); } };
  if (q.error) return <Alert color="red">{(q.error as Error).message}</Alert>;
  const when = (x: string | null) => (x ? new Date(x).toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: "2-digit" }) : "—");
  const list = (q.data ?? []).filter((u) => !filter || `${u.email} ${u.name} ${u.households.map((h) => h.name).join(" ")}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <Stack>
      <TextInput placeholder={t("admin.search")} value={filter} onChange={(e) => setFilter(e.currentTarget.value)} maw={360} />
      <ScrollArea type="auto">
        <Table striped fz="sm" miw={860}>
          <Table.Thead><Table.Tr>{["account", "households", "role", "verified", "created", "login", "enabled", "help"].map((c) => <Table.Th key={c}>{t(`admin.u.${c}`)}</Table.Th>)}</Table.Tr></Table.Thead>
          <Table.Tbody>
            {list.map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td><Text size="sm" fw={500}>{u.name}</Text><Text size="xs" c="dimmed">{u.email}{u.sso ? " · SSO" : ""}</Text></Table.Td>
                <Table.Td>{u.households.map((h) => <Text key={h.id} size="xs">{h.name}{h.role === "owner" ? " ★" : ""}</Text>)}</Table.Td>
                <Table.Td><Select size="xs" w={110} allowDeselect={false} value={u.role} data={[{ value: "USER", label: t("admin.u.user") }, { value: "ADMIN", label: t("admin.u.admin") }]}
                  onChange={(v) => v && v !== u.role && patch(u.id, { role: v })} /></Table.Td>
                <Table.Td>{u.emailVerifiedAt || u.sso ? <Badge color="green" variant="light" size="sm">{t("admin.u.yes")}</Badge> : <Badge color="orange" variant="light" size="sm">{t("admin.u.no")}</Badge>}</Table.Td>
                <Table.Td>{when(u.createdAt)}</Table.Td>
                <Table.Td>{when(u.lastLoginAt)}</Table.Td>
                <Table.Td><Switch checked={!u.disabled} onChange={(e) => patch(u.id, { disabled: !e.currentTarget.checked })} aria-label={t("admin.u.enabled")} /></Table.Td>
                <Table.Td><UserHelp user={u} onDone={() => q.refetch()} /></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}

/** Helping a person: a link to choose a new password (to give by hand), the address checked by hand or the check mail sent again. */
function UserHelp({ user, onDone }: { user: User; onDone: () => void }) {
  const { t } = useTranslation();
  const [link, setLink] = useState("");
  const call = async (path: string, ok: string) => {
    try { await api(`/admin/users/${user.id}/${path}`, { method: "POST" }); notifications.show({ color: "green", message: ok }); onDone(); } catch (e) { fail(e); }
  };
  return (
    <Group gap={4} wrap="nowrap">
      <Popover withArrow width={340} onClose={() => setLink("")}>
        <Popover.Target><Button size="compact-xs" variant="light" onClick={async () => {
          try { setLink((await api<{ link: string }>(`/admin/users/${user.id}/reset-link`, { method: "POST" })).link); } catch (e) { fail(e); }
        }}>{t("admin.u.resetLink")}</Button></Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <Text size="xs">{t("admin.u.resetLinkHelp", { name: user.name })}</Text>
            {link && <Group gap={4} wrap="nowrap"><TextInput readOnly value={link} size="xs" style={{ flex: 1 }} />
              <CopyButton value={link}>{({ copied, copy }) => <ActionIcon variant="subtle" onClick={copy} aria-label={t("admin.c.copyLink")}>{copied ? <IconCheck size={14} /> : <IconCopy size={14} />}</ActionIcon>}</CopyButton></Group>}
          </Stack>
        </Popover.Dropdown>
      </Popover>
      {!user.emailVerifiedAt && !user.sso && <>
        <Button size="compact-xs" variant="subtle" onClick={() => call("verification", t("admin.u.checkSent", { email: user.email }))}>{t("admin.u.resendCheck")}</Button>
        <Button size="compact-xs" variant="subtle" onClick={() => call("verify", t("common.saved"))}>{t("admin.u.verifyByHand")}</Button>
      </>}
    </Group>
  );
}

function CodesTab() {
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: ["admin-codes"], queryFn: () => api<Code[]>("/admin/signup-codes") });
  const o = useQuery({ queryKey: ["admin-overview"], queryFn: () => api<Overview>("/admin/overview") });
  const [f, setF] = useState<{ label: string; plan: string | null; maxUses: number | string; expiresAt: string; code: string }>({ label: "", plan: null, maxUses: 1, expiresAt: "", code: "" });
  const run = async (p: Promise<unknown>) => { try { await p; await q.refetch(); } catch (e) { fail(e); } };
  const create = () => run(api("/admin/signup-codes", { method: "POST", json: { label: f.label, plan: f.plan, maxUses: Number(f.maxUses) || 1,
    expiresAt: f.expiresAt ? new Date(f.expiresAt + "T23:59:59").toISOString() : null, ...(f.code.trim() ? { code: f.code.trim() } : {}) } })
    .then(() => setF({ label: "", plan: f.plan, maxUses: 1, expiresAt: "", code: "" })));
  const plans = [{ value: "", label: t("admin.c.planDefault") }, ...(o.data?.site.plans ?? []).map((p) => ({ value: p.code, label: p.name }))];
  const link = (c: string) => `${window.location.origin}/?code=${encodeURIComponent(c)}`;
  return (
    <Stack>
      {o.data && o.data.site.signup !== "code" && <Alert color="yellow">{t("admin.c.notCodeMode", { mode: o.data.site.signup })}</Alert>}
      <Card withBorder>
        <Text fw={600} mb="xs">{t("admin.c.new")}</Text>
        <Group align="end" gap="sm">
          <TextInput label={t("admin.c.label")} placeholder={t("admin.c.labelHint")} value={f.label} onChange={(e) => setF({ ...f, label: e.currentTarget.value })} w={220} />
          <Select label={t("admin.c.plan")} data={plans} value={f.plan ?? ""} onChange={(v) => setF({ ...f, plan: v || null })} allowDeselect={false} w={150} />
          <NumberInput label={t("admin.c.maxUses")} min={1} value={f.maxUses} onChange={(v) => setF({ ...f, maxUses: v })} w={110} />
          <TextInput type="date" label={t("admin.c.expires")} value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.currentTarget.value })} w={160} />
          <TextInput label={t("admin.c.code")} placeholder={t("admin.c.codeHint")} value={f.code} onChange={(e) => setF({ ...f, code: e.currentTarget.value.toUpperCase() })} w={170} />
          <Button onClick={create}>{t("admin.c.create")}</Button>
        </Group>
      </Card>
      <ScrollArea type="auto">
        <Table striped fz="sm" miw={760}>
          <Table.Thead><Table.Tr>{["code", "label", "plan", "uses", "expires", "enabled", ""].map((c, i) => <Table.Th key={i}>{c ? t(`admin.c.${c}`) : ""}</Table.Th>)}</Table.Tr></Table.Thead>
          <Table.Tbody>
            {(q.data ?? []).map((c) => (
              <Table.Tr key={c.id}>
                <Table.Td><Group gap={4} wrap="nowrap"><Text ff="monospace" size="sm">{c.code}</Text>
                  <CopyButton value={link(c.code)}>{({ copied, copy }) => (
                    <Tooltip label={copied ? t("admin.c.copied") : t("admin.c.copyLink")}><ActionIcon variant="subtle" size="sm" onClick={copy}>{copied ? <IconCheck size={14} /> : <IconCopy size={14} />}</ActionIcon></Tooltip>
                  )}</CopyButton></Group></Table.Td>
                <Table.Td>{c.label || "—"}</Table.Td>
                <Table.Td>{c.plan ?? t("admin.c.planDefault")}</Table.Td>
                <Table.Td style={{ fontVariantNumeric: "tabular-nums" }}>{c.uses} / {c.maxUses}</Table.Td>
                <Table.Td>{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString(i18n.language) : "—"}</Table.Td>
                <Table.Td><Switch checked={!c.disabled} onChange={(e) => run(api(`/admin/signup-codes/${c.id}`, { method: "PATCH", json: { disabled: !e.currentTarget.checked } }))} /></Table.Td>
                <Table.Td>{!c.uses && <ActionIcon variant="subtle" color="red" onClick={() => run(api(`/admin/signup-codes/${c.id}`, { method: "DELETE" }))} aria-label={t("common.delete")}><IconTrash size={16} /></ActionIcon>}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}
