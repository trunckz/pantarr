// Households (admin): name and language, accounts, people who eat and their rules, Mealie connection, aisles.
import { Alert, Button, Card, Checkbox, Code, Group, Modal, MultiSelect, ScrollArea, SegmentedControl, TagsInput, NumberInput, Switch, Select, Stack, Table, Tabs, Text, TextInput, Textarea, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Me } from "../../api";
import { useSimple } from "../../simple";
import { useHouseholds } from "../../household";
import { LANGUAGES } from "../../i18n";

interface Member { id: string; name: string; kind: "adult" | "child"; birthDate: string | null; rules: string; position: number; allergies: string[]; diets: string[] }
interface Entry { code: string; label: string; builtIn: boolean }
interface Catalogue { allergens: Entry[]; diets: Entry[] }
/** Codes ↔ labels: a label typed that is not in the catalogue becomes a household entry (its own name). */
const toLabels = (codes: string[], list: Entry[]) => codes.map((c) => list.find((e) => e.code === c)?.label ?? c);
const toCodes = (labels: string[], list: Entry[]) => labels.map((l) => list.find((e) => e.label.toLowerCase() === l.trim().toLowerCase())?.code ?? l.trim()).filter(Boolean);
interface Aisle { id: string; name: string; position: number; area: "in-store" | "online" }

const fail = (e: unknown) => notifications.show({ color: "red", message: (e as Error).message });

/** Choice of the household whose settings are shown (several households), and a new one (self-hosted administrator). */
export default function Households({ me }: { me: Me }) {
  const { t } = useTranslation();
  const simple = useSimple();
  const qc = useQueryClient();
  const h = useHouseholds();
  const admin = me.role === "ADMIN";
  // Owners manage only the households they own
  const list = admin ? h.list : h.list.filter((x) => x.memberships.some((m) => m.userId === me.id && m.role === "owner"));
  const current = list.find((x) => x.id === h.current?.id) ?? list[0] ?? null;
  const [name, setName] = useState("");
  const create = async () => {
    try { const x = await api<{ id: string }>("/households", { method: "POST", json: { name } }); setName(""); await h.refetch(); h.choose(x.id); } catch (e) { fail(e); }
  };
  return (
    <Stack maw={980}>
      <Group align="end">
        {list.length > 1 && (
          <Select label={t("settings.households")} data={list.map((x) => ({ value: x.id, label: x.name }))} value={current?.id ?? null}
            onChange={(v) => v && h.choose(v)} allowDeselect={false} w={260} />
        )}
        {admin && !simple && <TextInput label={t("households.new")} value={name} onChange={(e) => setName(e.currentTarget.value)} />}
        {admin && !simple && <Button onClick={create} disabled={!name}>{t("common.create")}</Button>}
      </Group>
    </Stack>
  );
}

export function HouseholdCard({ id, admin, onChange }: { id: string; admin: boolean; onChange: () => void }) {
  const { t } = useTranslation();
  const hh = useQuery({ queryKey: ["household", id], queryFn: () => api<{ name: string; locale: string; memberships?: { userId: string }[] }>(`/households/${id}`) });
  const simple = useSimple();   // hosted: the accounts of this household only (the whole instance is in the administration)
  const users = useQuery({ queryKey: ["users"], enabled: admin && !simple, queryFn: () => api<{ id: string; name: string; email: string }[]>("/users") });
  const list = useHouseholds();
  const [f, setF] = useState({ name: "", locale: "en" });
  const [userIds, setUserIds] = useState<string[]>([]);
  useEffect(() => { if (hh.data) setF({ name: hh.data.name, locale: hh.data.locale }); }, [hh.data]);
  useEffect(() => { setUserIds(list.current?.memberships.map((m) => m.userId) ?? []); }, [list.current]);
  const save = async () => {
    try {
      await api(`/households/${id}`, { method: "PATCH", json: f });
      if (admin && !simple) await api(`/households/${id}/users`, { method: "PUT", json: { userIds } });
      onChange(); notifications.show({ message: t("common.saved") });
    } catch (e) { fail(e); }
  };
  return (
      <Card withBorder>
        <Stack>
          <Group grow>
            <TextInput label={t("common.name")} value={f.name} onChange={(e) => setF({ ...f, name: e.currentTarget.value })} />
            <Select label={t("common.language")} data={Object.entries(LANGUAGES).map(([value, label]) => ({ value, label }))} value={f.locale} onChange={(v) => v && setF({ ...f, locale: v })} allowDeselect={false} />
          </Group>
          {admin && !simple && <MultiSelect label={t("households.users")} data={(users.data ?? []).map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))} value={userIds} onChange={setUserIds} />}
          <Group><Button onClick={save}>{t("common.save")}</Button></Group>
        </Stack>
      </Card>
  );
}

export function Members({ id }: { id: string }) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["members", id], queryFn: () => api<Member[]>(`/households/${id}/members`) });
  const cat = useQuery({ queryKey: ["catalogue", id], queryFn: () => api<Catalogue>(`/households/${id}/catalogue`) });
  const hh = useQuery({ queryKey: ["household", id], queryFn: () => api<{ settings: { customAllergens: string[]; customDiets: string[]; healthConsent?: { at: string } | null } }>(`/households/${id}`) });
  const run = async (p: Promise<unknown>) => { try { await p; q.refetch(); } catch (e) { fail(e); } };
  // hosted: allergies and diets (health or religious data) only with the household's explicit consent
  const simple = useSimple();
  const consent = hh.data?.settings.healthConsent ?? null;
  const sensitive = !simple || !!consent;
  const setConsent = async (given: boolean) => {
    try { await api(`/households/${id}/health-consent`, { method: "PUT", json: { given } }); await hh.refetch(); q.refetch(); } catch (e) { fail(e); }
  };
  const withdraw = () => modals.openConfirmModal({ title: t("consent.withdrawTitle"), children: <Text size="sm">{t("consent.withdrawText")}</Text>,
    labels: { confirm: t("consent.withdraw"), cancel: t("common.cancel") }, confirmProps: { color: "red" }, onConfirm: () => setConsent(false) });
  /** Saves a member; new allergens or diets typed by hand are added to the household's own lists. */
  const saveMember = async (m: Member, b: Partial<Member>) => {
    const c = cat.data!, s = hh.data!.settings;
    const known = (list: Entry[]) => new Set(list.map((e) => e.code));
    const newA = (b.allergies ?? []).filter((x) => !known(c.allergens).has(x)), newD = (b.diets ?? []).filter((x) => !known(c.diets).has(x));
    if (newA.length || newD.length) {
      await api(`/households/${id}`, { method: "PATCH", json: { settings: { customAllergens: [...s.customAllergens, ...newA], customDiets: [...s.customDiets, ...newD] } } });
      hh.refetch(); cat.refetch();
    }
    await run(api(`/households/${id}/members/${m.id}`, { method: "PATCH", json: b }));
  };
  const kinds = [{ value: "adult", label: t("households.kind.adult") }, { value: "child", label: t("households.kind.child") }];
  return (
    <Card withBorder>
      <Title order={4} mb="sm">{t("households.members")}</Title>
      <Stack>
        {simple && hh.data && (
          <Alert variant="light" color={consent ? "teal" : "blue"} title={t("consent.title")}>
            <Text size="sm" mb="xs">{t("consent.text")}</Text>
            {consent
              ? <Group gap="xs"><Text size="sm">{t("consent.given", { date: new Date(consent.at).toLocaleDateString() })}</Text>
                <Button size="compact-xs" variant="subtle" color="red" onClick={withdraw}>{t("consent.withdraw")}</Button></Group>
              : <Checkbox label={t("consent.accept")} checked={false} onChange={(e) => e.currentTarget.checked && setConsent(true)} />}
          </Alert>
        )}
        {cat.data && (q.data ?? []).map((m) => <MemberRow key={`${m.id}:${sensitive}`} m={m} kinds={kinds} catalogue={cat.data!} sensitive={sensitive} onSave={(b) => saveMember(m, b)}
          onDelete={() => run(api(`/households/${id}/members/${m.id}`, { method: "DELETE" }))} />)}
        <Group><Button variant="light" onClick={() => run(api(`/households/${id}/members`, { method: "POST", json: { name: "?", position: (q.data?.length ?? 0) } }))}>{t("households.addMember")}</Button></Group>
      </Stack>
    </Card>
  );
}

function MemberRow({ m, kinds, catalogue, sensitive, onSave, onDelete }: { m: Member; kinds: { value: string; label: string }[]; catalogue: Catalogue; sensitive: boolean;
  onSave: (b: Partial<Member>) => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ name: m.name, kind: m.kind, birthDate: m.birthDate?.slice(0, 10) ?? "", rules: m.rules,
    allergies: toLabels(m.allergies, catalogue.allergens), diets: toLabels(m.diets, catalogue.diets) });
  return (
    <Card withBorder padding="sm">
      <Group grow align="end">
        <TextInput label={t("common.name")} value={f.name} onChange={(e) => setF({ ...f, name: e.currentTarget.value })} />
        <Select label={t("common.role")} data={kinds} value={f.kind} onChange={(v) => v && setF({ ...f, kind: v as Member["kind"] })} allowDeselect={false} />
        <TextInput type="date" label={t("households.birthDate")} value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.currentTarget.value })} />
      </Group>
      <Group grow mt="xs" align="start">
        <TagsInput label={t("households.allergies")} description={sensitive ? t("households.allergiesHelp") : t("consent.needed")} data={catalogue.allergens.map((e) => e.label)} value={f.allergies}
          onChange={(v) => setF({ ...f, allergies: v })} clearable disabled={!sensitive} />
        <TagsInput label={t("households.diets")} description={sensitive ? t("households.dietsHelp") : t("consent.needed")} data={catalogue.diets.map((e) => e.label)} value={f.diets}
          onChange={(v) => setF({ ...f, diets: v })} clearable disabled={!sensitive} />
      </Group>
      <Textarea mt="xs" label={t("households.rules")} autosize minRows={2} value={f.rules} onChange={(e) => setF({ ...f, rules: e.currentTarget.value })} />
      <Group mt="xs">
        <Button size="xs" onClick={() => onSave({ name: f.name, kind: f.kind, rules: f.rules, birthDate: f.birthDate || null,
          ...(sensitive ? { allergies: toCodes(f.allergies, catalogue.allergens), diets: toCodes(f.diets, catalogue.diets) } : {}) })}>{t("common.save")}</Button>
        <Button size="xs" color="red" variant="subtle" onClick={onDelete}>{t("common.delete")}</Button>
      </Group>
    </Card>
  );
}

export function Aisles({ id }: { id: string }) {
  const { t } = useTranslation();
  const hh = useQuery({ queryKey: ["household", id], queryFn: () => api<{ settings: { storeAreas: Record<string, string>; defaultArea: string } }>(`/households/${id}`) });
  const q = useQuery({ queryKey: ["aisles", id], queryFn: () => api<Aisle[]>(`/households/${id}/aisles`), retry: false });
  const [name, setName] = useState("");
  const areas = [{ value: "in-store", label: t("shopping.inStore") }, { value: "online", label: t("shopping.online") }];
  const set = async (patch: { storeAreas?: Record<string, string>; defaultArea?: string }) => {
    try { await api(`/households/${id}`, { method: "PATCH", json: { settings: patch } }); hh.refetch(); q.refetch(); } catch (e) { fail(e); }
  };
  const call = async (path: string, method: string, json?: object) => {
    try { await api(`/households/${id}/aisles${path}`, { method, json }); q.refetch(); hh.refetch(); } catch (e) { fail(e); }
  };
  const list = q.data ?? [];
  const move = (i: number, d: -1 | 1) => {
    const ids = list.map((a) => a.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    call("/order", "PUT", { ids });
  };
  return (
    <Card withBorder>
      <Title order={4} mb={4}>{t("aisles.title")}</Title>
      <Text size="sm" c="dimmed" mb="sm">{t("aisles.intro")}</Text>
      {q.error && <Alert color="yellow">{(q.error as Error).message}</Alert>}
      <Table>
        <Table.Tbody>
          {list.map((a, i) => (
            <Table.Tr key={a.id}>
              <Table.Td>
                <TextInput variant="unstyled" defaultValue={a.name} aria-label={t("aisles.name")} key={a.name}
                  onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== a.name) call(`/${a.id}`, "PATCH", { name: v }); }}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
              </Table.Td>
              <Table.Td><SegmentedControl size="xs" data={areas} value={a.area}
                onChange={(v) => set({ storeAreas: { ...(hh.data?.settings.storeAreas ?? {}), [a.name]: v } })} /></Table.Td>
              <Table.Td style={{ whiteSpace: "nowrap" }}>
                <Button size="compact-xs" variant="subtle" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("aisles.up")}>↑</Button>
                <Button size="compact-xs" variant="subtle" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={t("aisles.down")}>↓</Button>
                <Button size="compact-xs" variant="subtle" color="red" onClick={() => call(`/${a.id}`, "DELETE")} aria-label={t("common.delete")}>✕</Button>
              </Table.Td>
            </Table.Tr>
          ))}
          {hh.data && (
            <Table.Tr>
              <Table.Td><i>{t("aisles.default")}</i></Table.Td>
              <Table.Td><SegmentedControl size="xs" data={areas} value={hh.data.settings.defaultArea} onChange={(v) => set({ defaultArea: v })} /></Table.Td>
              <Table.Td />
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
      <Group mt="sm" align="end">
        <TextInput label={t("aisles.new")} value={name} onChange={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { call("", "POST", { name: name.trim() }); setName(""); } }} />
        <Button variant="light" disabled={!name.trim()} onClick={() => { call("", "POST", { name: name.trim() }); setName(""); }}>{t("aisles.add")}</Button>
      </Group>
    </Card>
  );
}

interface PlanningConfig { habitualDishes: string[]; presenceRules: string; preferences: string; llmMonthlyCalls: number | null; timezone: string; promptTemplate: string | null; nutritionGuide?: boolean }

/** Planning: habits, presence, preferences, purchase rules, quota of LLM requests, prompt template (empty = default). */
export function PlanningSettings({ id }: { id: string }) {
  const simple = useSimple();   // hosted: no quota, time zone nor prompt (the platform's)
  const { t } = useTranslation();
  const hh = useQuery({ queryKey: ["household", id], queryFn: () => api<{ settings: PlanningConfig }>(`/households/${id}`) });
  const rules = useQuery({ queryKey: ["purchase-rules", id], queryFn: () => api<string[]>(`/households/${id}/purchase-rules`) });
  const [f, setF] = useState<{ dishes: string; presence: string; preferences: string; quota: number | string; timezone: string; template: string; rules: string; nutrition: boolean } | null>(null);
  const [preview, setPreview] = useState("");
  const [defaults, setDefaults] = useState<{ template: string; placeholders: string[] } | null>(null);
  /** The default prompt of the household's language: shown, or copied into the field to be adapted. */
  const showDefault = async (copy: boolean) => {
    try {
      const d = await api<{ template: string; placeholders: string[] }>(`/households/${id}/planning/default-template`);
      if (copy) setF((x) => (x ? { ...x, template: d.template } : x)); else setDefaults(d);
    } catch (e) { fail(e); }
  };
  useEffect(() => {
    if (hh.data && rules.data && !f) {
      const s = hh.data.settings;
      setF({ dishes: s.habitualDishes.join("\n"), presence: s.presenceRules, preferences: s.preferences, quota: s.llmMonthlyCalls ?? "", timezone: s.timezone, nutrition: s.nutritionGuide !== false,
        template: s.promptTemplate ?? "", rules: rules.data.join("\n") });
    }
  }, [hh.data, rules.data, f]);
  if (!f) return null;
  const lines = (x: string) => x.split("\n").map((l) => l.trim()).filter(Boolean);
  const save = async () => {
    try {
      await api(`/households/${id}`, { method: "PATCH", json: { settings: { habitualDishes: lines(f.dishes), presenceRules: f.presence, preferences: f.preferences,
        llmMonthlyCalls: f.quota === "" ? null : Number(f.quota), timezone: f.timezone, promptTemplate: f.template.trim() || null, nutritionGuide: f.nutrition } } });
      await api(`/households/${id}/purchase-rules`, { method: "PUT", json: { rules: lines(f.rules) } });
      notifications.show({ message: t("common.saved") });
    } catch (e) { fail(e); }
  };
  const monday = (() => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10); })();
  return (
    <Card withBorder>
      <Title order={4} mb="sm">{t("planningSettings.title")}</Title>
      <Stack>
        <Textarea label={t("planningSettings.dishes")} description={t("planningSettings.dishesHelp")} autosize minRows={4} maxRows={12} value={f.dishes} onChange={(e) => setF({ ...f, dishes: e.currentTarget.value })} />
        <Textarea label={t("planningSettings.presence")} description={t("planningSettings.presenceHelp")} autosize minRows={2} value={f.presence} onChange={(e) => setF({ ...f, presence: e.currentTarget.value })} />
        <Textarea label={t("planningSettings.preferences")} autosize minRows={2} value={f.preferences} onChange={(e) => setF({ ...f, preferences: e.currentTarget.value })} />
        <Textarea label={t("planningSettings.rules")} description={t("planningSettings.rulesHelp")} autosize minRows={3} value={f.rules} onChange={(e) => setF({ ...f, rules: e.currentTarget.value })} />
        <Switch label={t("planningSettings.nutrition")} description={t("planningSettings.nutritionHelp")} checked={f.nutrition} onChange={(e) => setF({ ...f, nutrition: e.currentTarget.checked })} />
        {!simple && <><Group grow>
          <NumberInput label={t("planningSettings.quota")} description={t("planningSettings.quotaHelp")} min={0} value={f.quota} onChange={(v) => setF({ ...f, quota: v })} />
          <TextInput label={t("planningSettings.timezone")} value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.currentTarget.value })} />
        </Group>
        <Textarea label={t("planningSettings.template")} description={t("planningSettings.templateHelp")} autosize minRows={3} maxRows={20}
          placeholder={t("planningSettings.templateEmpty")}
          styles={{ input: { fontFamily: "monospace", fontSize: 12 } }} value={f.template} onChange={(e) => setF({ ...f, template: e.currentTarget.value })} />
        <Group gap="xs">
          <Button size="xs" variant="light" onClick={() => showDefault(false)}>{t("planningSettings.viewDefault")}</Button>
          <Button size="xs" variant="subtle" onClick={() => showDefault(true)}>{f.template.trim() ? t("planningSettings.resetToDefault") : t("planningSettings.startFromDefault")}</Button>
        </Group>
        </>}
        {defaults && <Modal opened size="xl" onClose={() => setDefaults(null)} title={t("planningSettings.defaultTitle")}>
          <Stack gap="xs">
            <Text size="sm" c="dimmed">{t("planningSettings.placeholders")} {defaults.placeholders.map((x) => <Code key={x} mr={4}>{`{{ ${x} }}`}</Code>)}</Text>
            <Textarea readOnly autosize maxRows={30} value={defaults.template} styles={{ input: { fontFamily: "monospace", fontSize: 12 } }} />
            <Group justify="end"><Button onClick={() => { setF({ ...f, template: defaults.template }); setDefaults(null); }}>{t("planningSettings.startFromDefault")}</Button></Group>
          </Stack>
        </Modal>}
        <Group>
          <Button onClick={save}>{t("common.save")}</Button>
          {!simple && <Button variant="light" onClick={async () => { try { setPreview((await api<{ prompt: string }>(`/households/${id}/planning/prompt?start=${monday}&days=7`)).prompt); } catch (e) { fail(e); } }}>{t("planningSettings.preview")}</Button>}
        </Group>
        {preview && <Textarea readOnly autosize maxRows={25} value={preview} styles={{ input: { fontFamily: "monospace", fontSize: 12 } }} />}
      </Stack>
    </Card>
  );
}

/** Accounts that can sign in to the household, pending invitations, invite by e-mail. */
export function HouseholdAccounts({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: ["household-accounts", id], queryFn: () => api<{ accounts: { id: string; name: string; email: string; role: string; lastLoginAt: string | null }[];
    invites: { id: string; email: string; role: string | null; expiresAt: string }[] }>(`/households/${id}/accounts`) });
  const [email, setEmail] = useState(""), [role, setRole] = useState("member");
  const run = async (p: Promise<unknown>, ok?: string) => { try { await p; if (ok) notifications.show({ message: ok }); q.refetch(); } catch (e) { fail(e); } };
  const roleOf = (r: string | null) => t(r === "owner" ? "householdAccounts.owner" : "householdAccounts.member");
  return (
    <Card withBorder mt="md">
      <Title order={4} mb="xs">{t("householdAccounts.title")}</Title>
      <Text size="sm" c="dimmed" mb="sm">{t("householdAccounts.intro")}</Text>
      <Table>
        <Table.Tbody>
          {(q.data?.accounts ?? []).map((a) => (
            <Table.Tr key={a.id}>
              <Table.Td>{a.name}<Text size="xs" c="dimmed">{a.email}</Text></Table.Td>
              <Table.Td>{roleOf(a.role)}</Table.Td>
              <Table.Td><Text size="xs" c="dimmed">{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleDateString(i18n.language) : t("common.never")}</Text></Table.Td>
              <Table.Td><Button size="xs" variant="subtle" color="red" onClick={() => run(api(`/households/${id}/accounts/${a.id}`, { method: "DELETE" }))}>{t("householdAccounts.remove")}</Button></Table.Td>
            </Table.Tr>
          ))}
          {(q.data?.invites ?? []).map((v) => (
            <Table.Tr key={v.id}>
              <Table.Td><Text size="sm" fs="italic">{v.email}</Text><Text size="xs" c="dimmed">{t("householdAccounts.pending")}</Text></Table.Td>
              <Table.Td>{roleOf(v.role)}</Table.Td>
              <Table.Td />
              <Table.Td><Button size="xs" variant="subtle" color="gray" onClick={() => run(api(`/households/${id}/invites/${v.id}`, { method: "DELETE" }))}>{t("common.cancel")}</Button></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Group align="end" mt="sm">
        <TextInput label={t("householdAccounts.invite")} placeholder="prenom@exemple.fr" value={email} onChange={(e) => setEmail(e.currentTarget.value)} style={{ flex: 1, minWidth: 200 }} />
        <Select data={[{ value: "member", label: t("householdAccounts.member") }, { value: "owner", label: t("householdAccounts.owner") }]} value={role} onChange={(v) => v && setRole(v)} allowDeselect={false} w={150} />
        <Button disabled={!/@/.test(email)} onClick={() => run(api(`/households/${id}/invites`, { method: "POST", json: { email: email.trim(), role } }).then(() => setEmail("")), t("householdAccounts.sent"))}>{t("householdAccounts.send")}</Button>
      </Group>
    </Card>
  );
}

/** Shopping list: pantry staples never added, ingredients added when a period is validated. */
export function ShoppingSettings({ id }: { id: string }) {
  const { t } = useTranslation();
  const hh = useQuery({ queryKey: ["household", id], queryFn: () => api<{ settings: { pantryStaples: string[]; autoShopping: boolean; preferredBrands?: string[]; bannedBrands?: string[]; weeklyBudget?: number | null } }>(`/households/${id}`) });
  const [f, setF] = useState<{ staples: string; auto: boolean; like: string[]; ban: string[]; budget: number | string } | null>(null);
  useEffect(() => { if (hh.data && !f) setF({ staples: hh.data.settings.pantryStaples.join("\n"), auto: hh.data.settings.autoShopping,
    like: hh.data.settings.preferredBrands ?? [], ban: hh.data.settings.bannedBrands ?? [], budget: hh.data.settings.weeklyBudget ?? "" }); }, [hh.data, f]);
  if (!f) return null;
  const save = async () => {
    try {
      await api(`/households/${id}`, { method: "PATCH", json: { settings: { pantryStaples: f.staples.split("\n").map((x) => x.trim()).filter(Boolean), autoShopping: f.auto,
        preferredBrands: f.like, bannedBrands: f.ban, weeklyBudget: f.budget === "" || !Number(f.budget) ? null : Number(f.budget) } } });
      notifications.show({ message: t("common.saved") });
    } catch (e) { fail(e); }
  };
  return (
    <Card withBorder>
      <Title order={4} mb="sm">{t("shoppingSettings.title")}</Title>
      <Stack>
        <NumberInput label={t("shoppingSettings.budget")} description={t("shoppingSettings.budgetHelp")} min={0} max={5000} suffix=" €" value={f.budget} onChange={(v) => setF({ ...f, budget: v })} w={260} />
        <Switch label={t("shoppingSettings.auto")} checked={f.auto} onChange={(e) => setF({ ...f, auto: e.currentTarget.checked })} />
        <Textarea label={t("shoppingSettings.staples")} autosize minRows={3} maxRows={12} value={f.staples} onChange={(e) => setF({ ...f, staples: e.currentTarget.value })} />
        <TagsInput label={t("shoppingSettings.preferredBrands")} description={t("shoppingSettings.preferredBrandsHelp")} value={f.like} onChange={(v) => setF({ ...f, like: v })} clearable />
        <TagsInput label={t("shoppingSettings.bannedBrands")} description={t("shoppingSettings.bannedBrandsHelp")} value={f.ban} onChange={(v) => setF({ ...f, ban: v })} clearable />
        <Group><Button onClick={save}>{t("common.save")}</Button></Group>
      </Stack>
    </Card>
  );
}

/** Preferred products for the online cart: typed here (« Water : Native »), or learned from the choices made by hand. */
export function Preferences({ id }: { id: string }) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["preferences", id], queryFn: () => api<{ id: string; article: string; product: string; learned: boolean }[]>(`/households/${id}/preferences`) });
  const [typed, setTyped] = useState<string | null>(null);
  useEffect(() => { if (q.data && typed === null) setTyped(q.data.filter((p) => !p.learned).map((p) => `${p.article} : ${p.product}`).join("\n")); }, [q.data, typed]);
  if (typed === null) return null;
  const save = async () => {
    const preferences = typed.split("\n").map((l) => l.split(":")).filter((x) => x.length >= 2).map(([a, ...p]) => ({ article: a.trim(), product: p.join(":").trim() }));
    try { await api(`/households/${id}/preferences`, { method: "PUT", json: { preferences } }); q.refetch(); notifications.show({ message: t("common.saved") }); } catch (e) { fail(e); }
  };
  const learned = (q.data ?? []).filter((p) => p.learned);
  return (
    <Card withBorder>
      <Title order={4} mb="sm">{t("preferences.title")}</Title>
      <Stack>
        <Textarea label={t("preferences.typed")} description={t("preferences.typedHelp")} autosize minRows={3} value={typed} onChange={(e) => setTyped(e.currentTarget.value)} />
        <Group><Button onClick={save}>{t("common.save")}</Button></Group>
        {learned.length > 0 && <Text size="sm" fw={500}>{t("preferences.learned")}</Text>}
        {learned.map((p) => (
          <Group key={p.id} justify="space-between"><Text size="sm">{p.article} → {p.product}</Text>
            <Button size="compact-xs" variant="subtle" color="red" onClick={async () => { await api(`/households/${id}/preferences/${p.id}`, { method: "DELETE" }); q.refetch(); }}>{t("common.delete")}</Button></Group>
        ))}
      </Stack>
    </Card>
  );
}

/** How the receipts are read (self-hosted: OCR, OCR then the LLM, or the LLM ; hosted: always without AI). */
export function StockSettings({ id }: { id: string }) {
  const { t } = useTranslation();
  const simple = useSimple();
  const hh = useQuery({ queryKey: ["household", id], queryFn: () => api<{ settings: { receiptReader?: string } }>(`/households/${id}`) });
  const [reader, setReader] = useState<string | null>(null);
  useEffect(() => { if (hh.data && reader === null) setReader(hh.data.settings.receiptReader ?? "ocr"); }, [hh.data, reader]);
  if (simple || reader === null) return null;
  const save = async () => {
    try { await api(`/households/${id}`, { method: "PATCH", json: { settings: { receiptReader: reader } } }); notifications.show({ message: t("common.saved") }); } catch (e) { fail(e); }
  };
  return (
    <Card withBorder>
      <Title order={4} mb="sm">{t("stockSettings.title")}</Title>
      <Stack>
        <Select label={t("shoppingSettings.reader")} description={t("shoppingSettings.readerHelp")} allowDeselect={false} value={reader} onChange={(v) => v && setReader(v)}
          data={["ocr", "ocr-llm", "llm"].map((v) => ({ value: v, label: t(`shoppingSettings.readers.${v}`) }))} />
        <Group><Button onClick={save}>{t("common.save")}</Button></Group>
      </Stack>
    </Card>
  );
}
