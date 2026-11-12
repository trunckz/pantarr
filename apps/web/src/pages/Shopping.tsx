// Shopping list (kept in Mealie), made to be used in a shop with one hand: one list at a time (in store / online, in
// tabs with their count), one field to add (the aisle is guessed, the item goes to the list shown), a tap on an item
// to edit it (text, aisle, list), ⇄ to move it to the other list, the checked items folded at the bottom.
import { ActionIcon, Alert, Autocomplete, Badge, Button, Checkbox, Collapse, Group, Menu, Modal, Paper, SegmentedControl, Stack, Tabs, Text, TextInput,
  Title, Tooltip, UnstyledButton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowsExchange, IconChevronDown, IconChevronRight, IconDots, IconHomeCheck, IconPlus, IconShoppingCart, IconTrash } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { useHouseholds } from "../household";
import { money, useBudget } from "../components/WeekInsights";

type Area = "in-store" | "online";
interface Item { id: string; text: string; checked: boolean; aisle: string; area: Area; origin: string; dishes: string }
interface Shopping { list: string; aisles?: string[]; items: Item[] }

const TAB_KEY = "pantarr.shopping.area";
const storedTab = (): Area => { try { return (localStorage.getItem(TAB_KEY) as Area) || "in-store"; } catch { return "in-store"; } };

export default function Shopping() {
  const { t, i18n } = useTranslation();
  const h = useHouseholds();
  const base = `/households/${h.current?.id}`;
  const s = useQuery({ queryKey: ["shopping", h.current?.id], enabled: !!h.current, queryFn: () => api<Shopping>(`${base}/shopping`) });
  const stores = useQuery({ queryKey: ["stores", h.current?.id], enabled: !!h.current, queryFn: () => api<{ module: string; name: string; siteUrl: string; kind?: string }[]>(`${base}/stores`) });
  const [area, setArea] = useState<Area>(storedTab);
  const [text, setText] = useState(""), [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [edit, setEdit] = useState<Item | null>(null);
  // Shared lists (Keep, Home Assistant…): synced when the page opens, the list reloaded if something changed
  useEffect(() => {
    if (!h.current) return;
    api<{ results: { added: number; checked: number; removed: number }[] }>(`/households/${h.current.id}/list-sync`, { method: "POST" })
      .then((r) => { if (r.results.some((x) => x.added || x.checked || x.removed)) s.refetch(); }).catch(() => undefined);
  }, [h.current?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  // prices learned from the receipts: each article, and the list shown (a hook: before any early return)
  const budget = useBudget(h.current?.id);
  if (!h.isLoading && !h.current) return <Alert>{t("household.none")}</Alert>;

  const priceOf = new Map((budget.data?.list.lines ?? []).map((l) => [l.id, l.price]));
  const run = async (p: Promise<unknown>, done?: string) => {
    try { await p; await s.refetch(); budget.refetch(); if (done) notifications.show({ message: done }); }
    catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
  };
  const items = s.data?.items ?? [];
  // the household's aisles in the order of its store (Settings → Shopping → Aisles), then those only seen on items
  const order = s.data?.aisles ?? [];
  const aisles = [...new Set([...order, ...items.map((x) => x.aisle).filter(Boolean)])];
  const other = (a: Area): Area => (a === "online" ? "in-store" : "online");
  const areaName = (a: Area) => t(a === "online" ? "shopping.online" : "shopping.inStore");
  const chooseArea = (v: string | null) => { if (!v) return; setArea(v as Area); try { localStorage.setItem(TAB_KEY, v); } catch { /* private mode */ } };
  const patch = (x: Item, b: Partial<Pick<Item, "text" | "aisle" | "area" | "checked">>, done?: string) => run(api(`${base}/shopping/items/${x.id}`, { method: "PATCH", json: b }), done);
  const move = (x: Item) => patch(x, { area: other(x.area) }, t("shopping.moved", { item: x.text, list: areaName(other(x.area)) }));
  const add = async () => {
    const v = text.trim();
    if (!v) return;
    setAdding(true);
    await run(api(`${base}/shopping/items`, { method: "POST", json: { text: v, area } }).then(() => setText("")));
    setAdding(false);
  };

  const list = items.filter((x) => x.area === area);
  const todo = list.filter((x) => !x.checked), done = list.filter((x) => x.checked);
  const rank = (a: string) => { const i = order.indexOf(a); return a ? (i < 0 ? order.length : i) : order.length + 1; };
  const byAisle = [...new Set(todo.map((x) => x.aisle))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const count = (a: Area) => items.filter((x) => x.area === a && !x.checked).length;

  const row = (x: Item) => (
    <Group key={x.id} justify="space-between" wrap="nowrap" gap={4} py={6} style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
      <Group wrap="nowrap" gap="sm" style={{ flex: 1, minWidth: 0 }}>
        <Checkbox size="md" checked={x.checked} aria-label={x.text} onChange={(e) => patch(x, { checked: e.currentTarget.checked })} />
        <UnstyledButton onClick={() => setEdit(x)} style={{ flex: 1, minWidth: 0 }}>
          <Text td={x.checked ? "line-through" : undefined} c={x.checked ? "dimmed" : undefined} style={{ overflowWrap: "anywhere" }}>{x.text}</Text>
          {x.dishes && <Text size="xs" c="dimmed" lineClamp={1}>{x.dishes}</Text>}
        </UnstyledButton>
        {!x.checked && typeof priceOf.get(x.id) === "number" && <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>≈ {money(priceOf.get(x.id)!, i18n.language)}</Text>}
      </Group>
      {!x.checked && (
        <Group gap={0} wrap="nowrap">
          <Tooltip label={t("shopping.moveTo", { list: areaName(other(x.area)) })}>
            <ActionIcon variant="subtle" size="lg" onClick={() => move(x)} aria-label={t("shopping.moveTo", { list: areaName(other(x.area)) })}><IconArrowsExchange size={18} /></ActionIcon>
          </Tooltip>
          <Tooltip label={t("shopping.haveIt")}>
            <ActionIcon variant="subtle" size="lg" onClick={() => run(api(`${base}/shopping/items/${x.id}`, { method: "DELETE" }))} aria-label={t("shopping.haveIt")}><IconHomeCheck size={18} /></ActionIcon>
          </Tooltip>
        </Group>
      )}
    </Group>
  );

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <Title order={2}>{t("nav.shopping")}</Title>
        <Menu position="bottom-end">
          <Menu.Target><ActionIcon variant="subtle" size="lg" aria-label={t("common.more")}><IconDots size={20} /></ActionIcon></Menu.Target>
          <Menu.Dropdown>
            {(stores.data ?? []).filter((st) => st.kind !== "purchases").map((st) => (
              <Menu.Item key={st.module} component="a" href={`${st.siteUrl}#pantarr=${h.current?.id}`} target="_blank" rel="noopener" leftSection={<IconShoppingCart size={16} />}>
                {t("shopping.send", { store: st.name.split(" —")[0] })}</Menu.Item>
            ))}
            <Menu.Item leftSection={<IconTrash size={16} />} onClick={() => run(api(`${base}/shopping/clear-checked`, { method: "POST" }))}>{t("shopping.clear")}</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      {s.error && <Alert color="red">{(s.error as Error).message}</Alert>}

      <Tabs value={area} onChange={chooseArea}>
        <Tabs.List grow>
          {(["in-store", "online"] as const).map((a) => (
            <Tabs.Tab key={a} value={a} rightSection={<Badge size="sm" variant="light">{count(a)}</Badge>}>{areaName(a)}</Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      <Paper withBorder p="xs" style={{ position: "sticky", top: "calc(var(--app-shell-header-height, 56px) + 4px)", zIndex: 5 }}>
        <Group wrap="nowrap" gap="xs">
          <TextInput placeholder={t("shopping.addTo", { list: areaName(area) })} value={text} onChange={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && add()} style={{ flex: 1 }} aria-label={t("shopping.add")} enterKeyHint="done" />
          <ActionIcon size="lg" onClick={add} loading={adding} disabled={!text.trim()} aria-label={t("shopping.add")}><IconPlus size={18} /></ActionIcon>
        </Group>
      </Paper>

      {(() => {   // estimate of the list shown, from the prices paid before
        const l = budget.data?.list[area === "online" ? "online" : "inStore"];
        return l && l.priced > 0 ? <Text size="sm" c="dimmed">{t("shopping.estimate", { total: money(l.known, i18n.language), priced: l.priced, count: l.items })}</Text> : null;
      })()}
      {!todo.length && !done.length && <Text c="dimmed" ta="center" py="lg">{t("shopping.empty")}</Text>}
      {byAisle.map((a) => (
        <div key={a}>
          <Text size="xs" tt="uppercase" c="dimmed" fw={700} mt="xs">{a || t("shopping.noAisle")}</Text>
          {todo.filter((x) => x.aisle === a).map(row)}
        </div>
      ))}
      {done.length > 0 && (
        <div>
          <UnstyledButton onClick={() => setShowDone((v) => !v)} mt="sm">
            <Group gap={4}>{showDone ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              <Text size="xs" tt="uppercase" c="dimmed" fw={700}>{t("shopping.doneCount", { count: done.length })}</Text></Group>
          </UnstyledButton>
          <Collapse in={showDone}>{done.map(row)}</Collapse>
        </div>
      )}

      {edit && <EditItem item={edit} aisles={aisles} areaName={areaName} onClose={() => setEdit(null)}
        onSave={(b) => { patch(edit, b); setEdit(null); }}
        onDelete={() => { run(api(`${base}/shopping/items/${edit.id}`, { method: "DELETE" })); setEdit(null); }} />}
    </Stack>
  );
}

function EditItem({ item, aisles, areaName, onClose, onSave, onDelete }: {
  item: Item; aisles: string[]; areaName: (a: Area) => string; onClose: () => void;
  onSave: (b: Partial<Pick<Item, "text" | "aisle" | "area">>) => void; onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [f, setF] = useState({ text: item.text, aisle: item.aisle, area: item.area });
  const changed = { ...(f.text.trim() !== item.text ? { text: f.text.trim() } : {}), ...(f.aisle !== item.aisle ? { aisle: f.aisle } : {}), ...(f.area !== item.area ? { area: f.area } : {}) };
  const can = Object.keys(changed).length > 0 && !!f.text.trim();
  return (
    <Modal opened onClose={onClose} title={t("shopping.edit")} centered>
      <Stack>
        <TextInput label={t("shopping.item")} value={f.text} onChange={(e) => setF({ ...f, text: e.currentTarget.value })} data-autofocus
          onKeyDown={(e) => e.key === "Enter" && can && onSave(changed)} />
        <Autocomplete label={t("shopping.aisle")} description={t("shopping.aisleHelp")} data={aisles} value={f.aisle} onChange={(v) => setF({ ...f, aisle: v })} />
        <div>
          <Text size="sm" fw={500} mb={4}>{t("shopping.whichList")}</Text>
          <SegmentedControl fullWidth data={(["in-store", "online"] as const).map((a) => ({ value: a, label: areaName(a) }))} value={f.area}
            onChange={(v) => setF({ ...f, area: v as Area })} />
        </div>
        {item.dishes && <Text size="sm" c="dimmed">{t("shopping.forDishes", { dishes: item.dishes })}</Text>}
        <Group justify="space-between">
          <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={onDelete}>{t("common.delete")}</Button>
          <Button onClick={() => onSave(changed)} disabled={!can}>{t("common.save")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
