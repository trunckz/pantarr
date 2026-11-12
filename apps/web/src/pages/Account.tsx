import { Alert, Badge, Button, Card, Checkbox, Code, CopyButton, Group, PasswordInput, Select, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, Me } from "../api";
import { useSimple } from "../simple";
import { useHouseholds } from "../household";
import { LANGUAGES } from "../i18n";

interface Key { id: string; name: string; prefix: string; scopes: string[]; lastUsedAt: string | null }

export default function Account({ me }: { me: Me }) {
  const simple = useSimple();   // hosted: no API keys nor voice-assistant address
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: me.name, locale: me.locale, password: "" });
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => api<Key[]>("/api-keys") });
  const [nk, setNk] = useState({ name: "", scopes: ["read"] }), [created, setCreated] = useState("");
  const save = async () => {
    await api("/users/me", { method: "PATCH", json: { name: f.name, locale: f.locale, ...(f.password ? { password: f.password } : {}) } });
    i18n.changeLanguage(f.locale); qc.invalidateQueries({ queryKey: ["me"] }); notifications.show({ message: t("common.saved") });
  };
  const createKey = async () => {
    const r = await api<{ key: string }>("/api-keys", { method: "POST", json: nk });
    setCreated(r.key); setNk({ name: "", scopes: ["read"] }); keys.refetch();
  };
  const h = useHouseholds();
  const stores = useQuery({ queryKey: ["stores", h.current?.id], enabled: !!h.current, queryFn: () => api<{ module: string; name: string }[]>(`/households/${h.current!.id}/stores`) });
  const [install, setInstall] = useState<Record<string, string>>({});
  const bridgeLink = async (module: string) => {
    const r = await api<{ key: string }>("/api-keys", { method: "POST", json: { name: `${t("bridge.keyName")} (${module})`, scopes: ["bridge"] } });
    setInstall({ ...install, [module]: `${window.location.origin}/api/v1/bridge/${module}/userscript.user.js?k=${r.key}${h.current ? `&h=${h.current.id}` : ""}` }); keys.refetch();
  };
  const [voice, setVoice] = useState("");
  const voiceKey = async () => {
    const r = await api<{ key: string }>("/api-keys", { method: "POST", json: { name: t("voice.keyName"), scopes: ["bridge"] } });
    setVoice(r.key); keys.refetch();
  };
  // Personal data: export (JSON) and deletion of the account
  const [confirm, setConfirm] = useState(""), [deleting, setDeleting] = useState(false);
  const removeAccount = async () => {
    try {
      await api("/users/me", { method: "DELETE", json: { password: confirm, email: confirm } });
      window.location.href = "/";
    } catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
  };
  const voiceUrl = `${window.location.origin}/api/v1/bridge/list/add${h.current ? `?household=${h.current.id}` : ""}`;
  return (
    <Stack maw={720}>
      <Title order={2}>{t("account.title")}</Title>
      <Card withBorder>
        <Stack>
          <TextInput label={t("common.name")} value={f.name} onChange={(e) => setF({ ...f, name: e.currentTarget.value })} />
          <Text size="sm" c="dimmed">{me.email}</Text>
          <Select label={t("common.language")} data={Object.entries(LANGUAGES).map(([value, label]) => ({ value, label }))} value={f.locale} onChange={(v) => v && setF({ ...f, locale: v })} allowDeselect={false} />
          <PasswordInput label={t("account.newPassword")} value={f.password} onChange={(e) => setF({ ...f, password: e.currentTarget.value })} />
          <Group><Button onClick={save}>{t("common.save")}</Button></Group>
          <Text size="xs" c="dimmed">{t("account.passwordEndsSessions")}</Text>
          <Group>
            <Button variant="subtle" color="red" size="xs" onClick={async () => {
              try { await api("/auth/logout-everywhere", { method: "POST" }); window.location.href = "/"; }
              catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
            }}>{t("account.logoutEverywhere")}</Button>
          </Group>
        </Stack>
      </Card>
      {!simple && (stores.data ?? []).length > 0 && (
        <Card withBorder>
          <Stack>
            <Title order={4}>{t("bridge.title")}</Title>
            <Text size="sm">{t("bridge.intro")}</Text>
            <Text size="sm" c="dimmed">{t("bridge.devices")}</Text>
            {(stores.data ?? []).map((st) => (
              <Group key={st.module}>
                <Text fw={500}>{st.name}</Text>
                {install[st.module]
                  ? <Button component="a" href={install[st.module]} target="_blank">{t("bridge.install")}</Button>
                  : <Button variant="light" onClick={() => bridgeLink(st.module)}>{t("bridge.create")}</Button>}
              </Group>
            ))}
          </Stack>
        </Card>
      )}
      {!simple && <><Card withBorder>
        <Stack>
          <Title order={4}>{t("voice.title")}</Title>
          <Text size="sm">{t("voice.intro")}</Text>
          <Text size="sm" fw={500}>{t("voice.address")}</Text>
          <Group gap="xs"><Code>{voiceUrl}</Code><CopyButton value={voiceUrl}>{({ copied, copy }) => <Button size="xs" variant="subtle" onClick={copy}>{copied ? t("common.copied") : t("common.copy")}</Button>}</CopyButton></Group>
          {voice
            ? <Group gap="xs"><Code>{voice}</Code><CopyButton value={voice}>{({ copied, copy }) => <Button size="xs" variant="subtle" onClick={copy}>{copied ? t("common.copied") : t("common.copy")}</Button>}</CopyButton></Group>
            : <Group><Button variant="light" onClick={voiceKey}>{t("voice.create")}</Button></Group>}
          <Text size="sm" fw={500}>{t("voice.siriTitle")}</Text>
          <Text size="sm" component="ol" style={{ paddingLeft: 18, margin: 0 }}>
            {t("voice.siriSteps").split("\n").map((x) => <li key={x}>{x}</li>)}
          </Text>
          <Text size="sm" c="dimmed">{t("voice.others")}</Text>
        </Stack>
      </Card>
      <Card withBorder>
        <Stack>
          <Title order={4}>{t("apiKeys.title")}</Title>
          <Text size="sm" c="dimmed">{t("apiKeys.intro")}</Text>
          {created && (
            <Alert color="green" title={t("apiKeys.created")}>
              <Group><Code>{created}</Code><CopyButton value={created}>{({ copy }) => <Button size="xs" onClick={copy}>Copy</Button>}</CopyButton></Group>
            </Alert>
          )}
          <Table>
            <Table.Thead><Table.Tr><Table.Th>{t("common.name")}</Table.Th><Table.Th>{t("apiKeys.scopes")}</Table.Th><Table.Th>{t("apiKeys.lastUsed")}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {(keys.data ?? []).map((k) => (
                <Table.Tr key={k.id}>
                  <Table.Td>{k.name} <Code>{k.prefix}…</Code></Table.Td>
                  <Table.Td>{k.scopes.map((s) => <Badge key={s} variant="light" mr={4}>{s}</Badge>)}</Table.Td>
                  <Table.Td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString(i18n.language) : t("common.never")}</Table.Td>
                  <Table.Td><Button size="xs" color="red" variant="subtle" onClick={async () => { await api(`/api-keys/${k.id}`, { method: "DELETE" }); keys.refetch(); }}>{t("common.delete")}</Button></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group align="end">
            <TextInput label={t("common.name")} value={nk.name} onChange={(e) => setNk({ ...nk, name: e.currentTarget.value })} />
            <Checkbox.Group label={t("apiKeys.scopes")} value={nk.scopes} onChange={(scopes) => setNk({ ...nk, scopes })}>
              <Group mt={6}>{["read", "write", "bridge", ...(me.role === "ADMIN" ? ["admin"] : [])].map((s) => <Checkbox key={s} value={s} label={s} />)}</Group>
            </Checkbox.Group>
            <Button onClick={createKey} disabled={!nk.name || !nk.scopes.length}>{t("common.create")}</Button>
          </Group>
        </Stack>
      </Card></>}
      <Card withBorder>
        <Stack>
          <Title order={4}>{t("data.title")}</Title>
          <Text size="sm">{t("data.intro")}</Text>
          <Group><Button component="a" href="/api/v1/users/me/export" variant="light">{t("data.export")}</Button>
            {!deleting && <Button color="red" variant="subtle" onClick={() => setDeleting(true)}>{t("data.delete")}</Button>}</Group>
          {deleting && (
            <Alert color="red">
              <Stack>
                <Text size="sm">{t("data.deleteWarning")}</Text>
                <PasswordInput label={t("data.confirm")} value={confirm} onChange={(e) => setConfirm(e.currentTarget.value)} />
                <Group><Button color="red" onClick={removeAccount} disabled={!confirm}>{t("data.deleteNow")}</Button>
                  <Button variant="subtle" onClick={() => setDeleting(false)}>{t("common.cancel")}</Button></Group>
              </Stack>
            </Alert>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
