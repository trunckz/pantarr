// Pantry: what will run out soon, learned from the purchases (receipts, invoices). Add to the shopping list (with the
// usual product), « we still have some » (the household consumes more slowly than expected), import of the purchases.
import { Alert, Badge, Button, Card, Group, NumberInput, Popover, SimpleGrid, Stack, Switch, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, Me } from "../api";
import Receipts from "../components/Receipts";
import { useHouseholds } from "../household";

interface Family { id: string; category: string; name: string; status: "to_buy" | "soon" | "ok" | "stopped" | "unknown"; last: string | null; next: string | null; cycleDays: number | null; purchases: number; product: string | null; forcedDays: number | null; stock: number | null }
const COLORS = { to_buy: "red", soon: "orange", ok: "green", stopped: "gray", unknown: "gray" } as const;

export default function Pantry({ me }: { me: Me }) {
  const { t, i18n } = useTranslation();
  const h = useHouseholds();
  const base = `/households/${h.current?.id}`;
  const [all, setAll] = useState(false), [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["pantry", h.current?.id], enabled: !!h.current, queryFn: () => api<Family[]>(`${base}/pantry`) });
  const sum = useQuery({ queryKey: ["purchases", h.current?.id], enabled: !!h.current, queryFn: () => api<{ products: number; purchases: number; lastPurchase: string | null }>(`${base}/purchases/summary`) });
  if (!h.isLoading && !h.current) return <Alert>{t("household.none")}</Alert>;
  const run = async (p: Promise<unknown>, done?: string) => {
    try { await p; if (done) notifications.show({ message: done }); await q.refetch(); }
    catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
  };
  const date = (x: string | null) => (x ? new Date(x + "T12:00:00Z").toLocaleDateString(i18n.language, { day: "numeric", month: "short" }) : "—");
  const shown = (q.data ?? []).filter((f) => all || f.status === "to_buy" || f.status === "soon");
  const toBuy = (q.data ?? []).filter((f) => f.status === "to_buy");
  const categories = [...new Set(shown.map((f) => f.category))];
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t("nav.pantry")}</Title>
        <Group>
          {sum.data && <Text size="sm" c="dimmed">{t("pantry.summary", { purchases: sum.data.purchases, products: sum.data.products, last: date(sum.data.lastPurchase) })}</Text>}
          <Button variant="light" loading={busy} onClick={async () => { setBusy(true); try { const r = await api<{ documents: number; purchases: number }>(`${base}/purchases/import`, { method: "POST", json: {} }); notifications.show({ message: t("pantry.imported", r) }); sum.refetch(); q.refetch(); } catch (e) { notifications.show({ color: "red", message: (e as Error).message }); } setBusy(false); }}>{t("pantry.import")}</Button>
        </Group>
      </Group>
      <Text c="dimmed" size="sm">{t("pantry.intro")}</Text>
      {h.current && <Receipts household={h.current.id} onRead={() => { q.refetch(); sum.refetch(); }} />}
      <Group>
        <Button disabled={!toBuy.length} onClick={() => run(Promise.all(toBuy.map((f) => api(`${base}/pantry/${f.id}/add-to-list`, { method: "POST" }))), t("pantry.addedAll", { count: toBuy.length }))}>{t("pantry.addAll", { count: toBuy.length })}</Button>
        <Switch label={t("pantry.showAll")} checked={all} onChange={(e) => setAll(e.currentTarget.checked)} />
      </Group>
      {q.error && <Alert color="red">{(q.error as Error).message}</Alert>}
      {!shown.length && q.data && <Text c="dimmed">{t("pantry.nothing")}</Text>}
      {categories.map((c) => (
        <div key={c}>
          <Title order={5} mb={6}>{c}</Title>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
            {shown.filter((f) => f.category === c).map((f) => (
              <Card key={f.id} withBorder padding="sm">
                <Group justify="space-between" wrap="nowrap">
                  <Text fw={600}>{f.name}</Text>
                  <Badge color={COLORS[f.status]} variant="light">{t(`pantry.status.${f.status}`)}</Badge>
                  {f.stock !== null && <Badge color="gray" variant="outline">{t("pantry.stock", { count: f.stock })}</Badge>}
                </Group>
                <Text size="sm" c="dimmed">
                  {f.next ? t("pantry.rhythm", { last: date(f.last), days: f.cycleDays, next: date(f.next) }) : t("pantry.fewPurchases", { count: f.purchases })}
                </Text>
                {f.product && <Text size="xs" c="dimmed" lineClamp={1}>{f.product}</Text>}
                <Group mt="xs" gap="xs">
                  <Button size="xs" onClick={() => run(api(`${base}/pantry/${f.id}/add-to-list`, { method: "POST" }), t("pantry.added", { name: f.name }))}>{t("pantry.add")}</Button>
                  <Button size="xs" variant="light" onClick={() => run(api(`${base}/pantry/${f.id}/still-have`, { method: "POST" }))}>{t("pantry.stillHave")}</Button>
                  {me.role === "ADMIN" && <ForcedDays base={base} f={f} onSaved={() => q.refetch()} />}
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        </div>
      ))}
    </Stack>
  );
}

/** Forced cycle (bought elsewhere, or too rarely to estimate). */
function ForcedDays({ base, f, onSaved }: { base: string; f: Family; onSaved: () => void }) {
  const { t } = useTranslation();
  const [v, setV] = useState<number | string>(f.forcedDays ?? "");
  return (
    <Popover withArrow>
      <Popover.Target><Button size="xs" variant="subtle">{f.forcedDays ? t("pantry.forced", { days: f.forcedDays }) : t("pantry.setCycle")}</Button></Popover.Target>
      <Popover.Dropdown>
        <NumberInput label={t("pantry.cycleLabel")} min={1} value={v} onChange={setV} w={200} />
        <Group mt="xs"><Button size="xs" onClick={async () => { await api(`${base}/pantry/families/${f.id}`, { method: "PATCH", json: { forcedDays: v === "" ? null : Number(v) } }); onSaved(); }}>{t("common.save")}</Button></Group>
      </Popover.Dropdown>
    </Popover>
  );
}
