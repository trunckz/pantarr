// Connectors: each one enabled and configured on its own card (form built from its manifest), tested. Those of the
// household on the Settings page ; those of the whole instance (Mealie, LLM, document manager) in the Administration.
import { ActionIcon, Alert, Anchor, Badge, Button, Card, Code, Collapse, Group, List, Loader, Modal, NumberInput, PasswordInput, Select, SimpleGrid, Stack, Switch, Text, TextInput,
  Title, Tooltip } from "@mantine/core";
import { IconBrandGoogle, IconBrandWindows, IconExternalLink, IconHelp, IconListCheck, IconPlugConnectedX } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Me, type Status } from "../../api";
import { Link } from "react-router-dom";
import { useHouseholds } from "../../household";
import { useSimple } from "../../simple";
import ForwardAddress from "./ForwardAddress";
import Extension from "./Extension";

interface Field { type: "string" | "number" | "boolean" | "url"; title: string; description?: string; secret?: boolean; required?: boolean; default?: string | number | boolean; hidden?: boolean }
interface Guide { intro?: string; steps: string[]; links?: { label: string; url: string }[] }
export interface Manifest { id: string; kind: string; name: string; description?: string; countries?: string[]; bridge?: boolean; planned?: boolean; settings: Record<string, Field>; scope?: "instance" | "household";
  oauth?: "google" | "microsoft" | "todoist"; platformOAuth?: boolean; guide?: Guide }
const MASK = "********";
/** Texts of a manifest in the interface language when translated (« connectors.m.<id>.name », « ….<field> »), else the manifest's. */
const useLabels = () => {
  const { t, i18n } = useTranslation();
  const tr = (key: string, fallback?: string) => (i18n.exists(key) ? t(key) : fallback ?? "");
  return { name: (m: Manifest) => tr(`connectors.m.${m.id}.name`, m.name), description: (m: Manifest) => tr(`connectors.m.${m.id}.description`, m.description),
    field: (m: Manifest, k: string, f: Field) => tr(`connectors.m.${m.id}.${k}`, f.title), fieldHelp: (m: Manifest, k: string, f: Field) => tr(`connectors.m.${m.id}.${k}Help`, f.description) };
};
const PROVIDER = { google: "Google", microsoft: "Microsoft", todoist: "Todoist" } as const;
const ProviderIcon = ({ p }: { p: keyof typeof PROVIDER }) => p === "google" ? <IconBrandGoogle size={16} /> : p === "microsoft" ? <IconBrandWindows size={16} /> : <IconListCheck size={16} />;

/** A step of a guide: `code` as code, addresses as links. */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`|https?:\/\/[^\s)]+)/g).map((p, i) => p.startsWith("`") ? <Code key={i}>{p.slice(1, -1)}</Code>
    : /^https?:\/\//.test(p) ? <Anchor key={i} href={p} target="_blank" rel="noopener">{p}</Anchor> : p)}</>;
}

function GuideModal({ m, onClose }: { m: Manifest; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal opened onClose={onClose} title={t("connectors.helpTitle", { name: useLabels().name(m) })} size="lg">
      <Stack gap="sm">
        {m.guide?.intro && <Text size="sm"><Rich text={m.guide.intro} /></Text>}
        <List type="ordered" spacing="sm" size="sm">{m.guide?.steps.map((s, i) => <List.Item key={i}><Rich text={s} /></List.Item>)}</List>
        {!!m.guide?.links?.length && <Group gap="xs">{m.guide.links.map((l) => (
          <Button key={l.url} component="a" href={l.url} target="_blank" rel="noopener" size="xs" variant="light" rightSection={<IconExternalLink size={14} />}>{l.label}</Button>
        ))}</Group>}
      </Stack>
    </Modal>
  );
}
const KINDS = ["recipes", "llm", "calendar", "documents", "purchases", "cart", "list-sync", "inventory"];
/** A household sets this connector itself (hosted: the server only offers the one-click ones). */
const forHousehold = (m: Manifest) => m.scope !== "instance";

/** Connectors of the household ; « kinds »: only those families (each settings tab shows those that feed it). */
export default function Connectors({ kinds = KINDS, embedded = false }: { kinds?: string[]; embedded?: boolean }) {
  const { t } = useTranslation();
  const h = useHouseholds();
  const manifests = useQuery({ queryKey: ["connectors"], queryFn: () => api<Manifest[]>("/connectors/available") });
  const states = useQuery({ queryKey: ["connector-states", h.current?.id], enabled: !!h.current, queryFn: () => api<Record<string, boolean>>(`/households/${h.current!.id}/connectors`) });
  const status = useQuery({ queryKey: ["status"], queryFn: () => api<Status>("/auth/status") });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/auth/me") });
  const hosted = status.data?.mode === "hosted";
  // Back from « Connect with Google / Microsoft »: say how it went, then clean the address
  useEffect(() => {
    const q = new URLSearchParams(window.location.search), r = q.get("oauth");
    if (!r) return;
    const name = (manifests.data ?? []).find((m) => m.id === q.get("module"))?.name ?? q.get("module") ?? "";
    if (r === "ok") notifications.show({ color: "green", message: t("connectors.oauthOk", { name }) });
    else if (q.get("reason") === "otherBrowser" || q.get("reason") === "expired") notifications.show({ color: "red", autoClose: 15000, message: t("connectors.oauthRestart", { name }) });
    else notifications.show({ color: "red", autoClose: 15000, message: t("connectors.oauthError", { name, reason: q.get("reason") ?? "" }) });
    window.history.replaceState(null, "", window.location.pathname);
    states.refetch();
  }, [manifests.data]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!h.current) return <Alert>{t("household.none")}</Alert>;
  return (
    <Stack>
      {!embedded && <Group justify="space-between">
        <Text c="dimmed">{t("connectors.householdIntro")}</Text>
        {h.list.length > 1 && <Select data={h.list.map((x) => ({ value: x.id, label: x.name }))} value={h.current.id} onChange={(v) => v && h.choose(v)} allowDeselect={false} w={220} />}
      </Group>}
      {KINDS.filter((k) => kinds.includes(k)).map((kind) => {
        // hosted: the stores are chosen on the extension's card (no browser script to install by hand)
        const list = (manifests.data ?? []).filter((m) => m.kind === kind && forHousehold(m));
        if (!list.length && kind !== "cart" && kind !== "documents") return null;
        return (
          <div key={kind}>
            <Title order={5} mb={6}>{t(`connectors.kinds.${kind}`)}</Title>
            <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
              {kind === "documents" && <ForwardAddress household={h.current!.id} />}
              {kind === "cart" && <Extension household={h.current!.id} states={states.data ?? {}} onChange={() => states.refetch()} />}
              {list.map((m) => <ConnectorCard key={m.id} base={`/households/${h.current!.id}/connectors`} m={m} enabled={!!states.data?.[m.id]} onChange={() => states.refetch()} />)}
            </SimpleGrid>
          </div>
        );
      })}
    </Stack>
  );
}

/** Connectors of the whole instance (Administration page): Mealie, LLM, document manager. */
export function InstanceConnectors() {
  const { t } = useTranslation();
  const manifests = useQuery({ queryKey: ["instance-manifests"], queryFn: () => api<Manifest[]>("/admin/connectors/manifests") });
  const states = useQuery({ queryKey: ["instance-connectors"], queryFn: () => api<Record<string, { enabled: boolean; households: string[]; server?: boolean }>>("/admin/connectors") });
  const list = manifests.data ?? [];
  const hosted = useSimple();
  return (
    <Stack>
      <Text c="dimmed">{t(hosted ? "connectors.platformIntro" : "connectors.instanceIntro")}</Text>
      {KINDS.map((kind) => {
        const of = list.filter((m) => m.kind === kind);
        if (!of.length) return null;
        return (
          <div key={kind}>
            <Title order={5} mb={6}>{t(`connectors.kinds.${kind}`)}</Title>
            <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
              {of.map((m) => (
                <Stack key={m.id} gap={4}>
                  <ConnectorCard base="/admin/connectors" m={m} enabled={!!states.data?.[m.id]?.enabled} onChange={() => states.refetch()} />
                  {states.data?.[m.id]?.server && <Text size="xs" c="dimmed">{t("connectors.fromServer")}</Text>}
                  {!!states.data?.[m.id]?.households.length && <Text size="xs" c="dimmed">{t("connectors.ownSettings", { households: states.data[m.id].households.join(", ") })}</Text>}
                </Stack>
              ))}
            </SimpleGrid>
          </div>
        );
      })}
    </Stack>
  );
}

function ConnectorCard({ base, m, enabled, onChange }: { base: string; m: Manifest; enabled: boolean; onChange: () => void }) {
  const { t } = useTranslation();
  const L = useLabels();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, unknown> | null>(null);
  const [test, setTest] = useState<{ ok: boolean; message?: string; user?: string; error?: string } | null>(null);
  const [help, setHelp] = useState(false);
  const [account, setAccount] = useState("");
  const connected = values?.refreshToken === MASK || (m.oauth === "todoist" && values?.token === MASK);
  const oneClick = !!m.platformOAuth;
  const fields = Object.entries(m.settings).filter(([, f]) => !f.hidden);
  /** Goes to the provider's consent page (with the household's own client: saved first). */
  const connect = async () => {
    try {
      if (!oneClick) await api(`${base}/${m.id}`, { method: "PUT", json: { enabled: true, settings: values ?? {} } });
      const r = await api<{ url: string }>(`${base}/${m.id}/oauth`);
      window.location.href = r.url;
    } catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
  };
  const disconnect = async () => {
    try { await api(`${base}/${m.id}/oauth`, { method: "DELETE" }); setValues(null); setAccount(""); onChange(); }
    catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
  };
  // One-click connectors: read at once (connected or not, which account); the others when opened
  useEffect(() => {
    if ((!open && !oneClick) || values || m.planned) return;
    api<{ settings: Record<string, unknown> }>(`${base}/${m.id}`).then((r) => {
      const v: Record<string, unknown> = {};
      for (const [k, f] of Object.entries(m.settings)) v[k] = r.settings[k] ?? f.default ?? (f.type === "boolean" ? false : "");
      setValues(v); setAccount(String(r.settings.account ?? ""));
    });
  }, [open, oneClick, values, base, m]);
  const save = async (on: boolean) => {
    try {
      await api(`${base}/${m.id}`, { method: "PUT", json: { enabled: on, settings: values ?? {} } });
      onChange();
      if (on) setTest(await api<{ ok: boolean; message?: string; user?: string; error?: string }>(`${base}/${m.id}/test`, { method: "POST" }).catch(() => null));
      notifications.show({ message: t("common.saved") });
    } catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
  };
  const field = (k: string, f: Field) => {
    if (f.hidden) return null;
    const v = values?.[k];
    const set = (x: unknown) => setValues({ ...(values ?? {}), [k]: x });
    const label = L.field(m, k, f), help = L.fieldHelp(m, k, f);
    if (f.type === "boolean") return <Switch key={k} label={label} checked={!!v} onChange={(e) => set(e.currentTarget.checked)} />;
    if (f.type === "number") return <NumberInput key={k} label={label} description={help} value={v as number} onChange={set} />;
    if (f.secret) return <PasswordInput key={k} label={label} description={help} required={f.required} value={String(v ?? "")} onChange={(e) => set(e.currentTarget.value)} />;
    return <TextInput key={k} label={label} description={help} required={f.required} value={String(v ?? "")} onChange={(e) => set(e.currentTarget.value)} />;
  };
  return (
    <Card withBorder>
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Text fw={600}>{L.name(m)}</Text>
          <Group gap={4} mt={2}>
            {m.planned && <Badge color="gray" variant="outline" size="sm">{t("connectors.planned")}</Badge>}
            {m.bridge && <Badge color="orange" variant="outline" size="sm">{t("connectors.bridge")}</Badge>}
            {m.countries?.map((c) => <Badge key={c} color="blue" variant="outline" size="sm">{c}</Badge>)}
            {enabled && <Badge color="green" size="sm">{t("connectors.enabled")}</Badge>}
            {m.oauth && values && !oneClick && <Badge color={connected ? "teal" : "gray"} variant="light" size="sm">{t(connected ? "connectors.connected" : "connectors.notConnected")}</Badge>}
          </Group>
        </div>
        <Group gap={4} wrap="nowrap">
          {m.guide && <Tooltip label={t("connectors.help")}><ActionIcon variant="subtle" onClick={() => setHelp(true)} aria-label={t("connectors.help")}><IconHelp size={20} /></ActionIcon></Tooltip>}
          {!m.planned && <Switch checked={enabled} onChange={(e) => { const on = e.currentTarget.checked;
            if (on && oneClick && !connected) { connect(); return; }
            if (on && !values) { setOpen(true); return; } save(on); }} />}
        </Group>
      </Group>
      {help && <GuideModal m={m} onClose={() => setHelp(false)} />}
      {L.description(m) && <Text size="sm" c="dimmed" mt="xs">{L.description(m)}</Text>}
      {oneClick && m.oauth && values && (connected
        ? <Group mt="sm" gap="xs" justify="space-between">
            <Text size="sm">{account ? t("connectors.connectedAs", { account }) : t("connectors.connected")}</Text>
            <Button size="xs" variant="subtle" color="gray" leftSection={<IconPlugConnectedX size={14} />} onClick={disconnect}>{t("connectors.disconnect")}</Button>
          </Group>
        : <Button mt="sm" fullWidth color={m.oauth === "google" ? "red" : m.oauth === "todoist" ? "orange" : "blue"} leftSection={<ProviderIcon p={m.oauth} />} onClick={connect}>
            {t("connectors.connect", { provider: PROVIDER[m.oauth] })}</Button>)}
      {!m.planned && (!oneClick || (connected && fields.length > 0)) && <Button variant="subtle" size="xs" mt="xs" onClick={() => setOpen((o) => !o)}>{open ? t("connectors.hide") : t("connectors.configure")}</Button>}
      {open && !values && <Loader size="sm" mt="sm" />}
      {/* Ouvert seulement une fois les réglages chargés : sinon le panneau garde la hauteur d'un contenu vide */}
      <Collapse in={open && values !== null}>
        {values && (
          <Stack mt="sm">
            {Object.entries(m.settings).map(([k, f]) => field(k, f))}
            {m.oauth && !oneClick && <Button variant={connected ? "light" : "filled"} color={m.oauth === "google" ? "red" : "blue"} onClick={connect}
              disabled={!values.clientId} leftSection={<ProviderIcon p={m.oauth} />}>
              {t(connected ? "connectors.reconnect" : "connectors.connect", { provider: PROVIDER[m.oauth] })}</Button>}
            {test && <Alert color={test.ok ? "green" : "red"}>{test.ok ? (test.message ?? (test.user ? t("mealie.ok", { user: test.user }) : "OK")) : test.error}</Alert>}
            <Group>
              <Button onClick={() => save(true)}>{t(oneClick ? "common.save" : "connectors.saveEnable")}</Button>
              {enabled && <Button variant="light" onClick={async () => setTest(await api<{ ok: boolean; message?: string; user?: string; error?: string }>(`${base}/${m.id}/test`, { method: "POST" }))}>{t("mealie.test")}</Button>}
            </Group>
          </Stack>
        )}
      </Collapse>
    </Card>
  );
}
