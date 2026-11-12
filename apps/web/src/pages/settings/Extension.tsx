// Browser extension card: install it (Chrome, Firefox), connect it with a code, choose the household's stores (online
// basket filled from Pantarr, Lidl Plus receipts read). Replaces the userscripts for everyone.
import { Alert, Anchor, Badge, Button, Card, Code, Group, Stack, Switch, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBrandChrome, IconBrandFirefox, IconDownload, IconPuzzle } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Me } from "../../api";

interface Info { version: string; chrome: string | null; firefox: string | null; stores: { id: string; name: string; kind: string; siteUrl: string | null }[] }

const storeName = (s: Info["stores"][number], t: (k: string) => string) => (s.id === "lidl-plus" ? t("extension.lidl") : s.name.replace(/\s+—\s+cart$/, ""));

export default function Extension({ household, states, onChange }: { household: string; states: Record<string, boolean>; onChange: () => void }) {
  const { t } = useTranslation();
  const info = useQuery({ queryKey: ["extension"], queryFn: () => api<Info>("/extension") });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/auth/me") });
  const [code, setCode] = useState<string | null>(null);
  const fail = (e: unknown) => notifications.show({ color: "red", message: (e as Error).message });
  const getCode = async () => { try { setCode((await api<{ code: string }>(`/households/${household}/extension/code`, { method: "POST" })).code); } catch (e) { fail(e); } };
  const toggle = async (id: string, on: boolean) => {
    try { await api(`/households/${household}/connectors/${id}`, { method: "PUT", json: { enabled: on, settings: {} } }); onChange(); } catch (e) { fail(e); }
  };
  const d = info.data;
  if (!d) return null;
  const published = !!(d.chrome || d.firefox);
  return (
    <Card withBorder>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs"><IconPuzzle size={20} /><Text fw={600}>{t("extension.title")}</Text></Group>
        <Badge variant="light" size="sm">{d.version}</Badge>
      </Group>
      <Text size="sm" c="dimmed" mt="xs">{t("extension.intro")}</Text>
      <Stack gap="xs" mt="sm">
        <Text size="sm" fw={500}>1. {t("extension.install")}</Text>
        {published
          ? <Group gap="xs">
              {d.chrome && <Button size="xs" component="a" href={d.chrome} target="_blank" rel="noopener" leftSection={<IconBrandChrome size={14} />}>Chrome / Edge</Button>}
              {d.firefox && <Button size="xs" component="a" href={d.firefox} target="_blank" rel="noopener" leftSection={<IconBrandFirefox size={14} />}>Firefox</Button>}
            </Group>
          : <Alert variant="light" p="xs"><Text size="sm">{t("extension.soon")}</Text>
              {me.data?.role === "ADMIN" && <Anchor size="sm" href="/api/v1/extension/pantarr-extension.zip"><IconDownload size={12} /> {t("extension.download")}</Anchor>}</Alert>}
        <Text size="sm" fw={500}>2. {t("extension.connect")}</Text>
        {code
          ? <Group gap="xs"><Code fz="xl" style={{ letterSpacing: 2 }}>{code}</Code><Text size="xs" c="dimmed">{t("extension.codeHelp")}</Text></Group>
          : <Group><Button size="xs" variant="light" onClick={getCode}>{t("extension.getCode")}</Button></Group>}
        <Text size="sm" fw={500}>3. {t("extension.stores")}</Text>
        <Stack gap={4}>
          {d.stores.map((s) => <Switch key={s.id} size="sm" label={storeName(s, t)} checked={!!states[s.id]} onChange={(e) => toggle(s.id, e.currentTarget.checked)} />)}
        </Stack>
      </Stack>
    </Card>
  );
}
