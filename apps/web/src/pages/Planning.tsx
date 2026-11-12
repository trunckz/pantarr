// Meal planning: proposal by the LLM for a period (background job, the page can be closed), change one meal (with the
// meals linked to it by leftovers), validate into Mealie, shopping list prepared by the LLM. Without a draft, the meal
// plan of Mealie for the period. Two views: the list by day (details folded, for a glance on a phone) and the week grid.
import { ActionIcon, Alert, Anchor, Badge, Button, Card, Checkbox, Collapse, Group, Loader, Popover, ScrollArea, SegmentedControl, Select, SimpleGrid, Stack,
  Table, Text, Textarea, TextInput, Title, UnstyledButton } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconCalendar, IconChevronDown, IconChevronLeft, IconChevronRight, IconRecycle, IconSparkles } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import RecipeLink from "../components/RecipeLink";
import WeekInsights, { type Balance } from "../components/WeekInsights";
import { NextSteps } from "../onboarding";
import { useHouseholds } from "../household";

interface Meal {
  date: string; meal: "lunch" | "dinner"; for?: string[]; dish: string; minutes?: number; recipeUrl?: string | null;
  adjustments?: { member: string; text: string }[]; leftovers_for?: string | null; leftovers_from?: string | null;
  warnings?: { member: string; allergen: string; ingredient: string }[]; note?: string;
  /** « recipe »: time of the Mealie recipe ; « estimate »: guessed by the model (shown with ≈) */
  minutesSource?: "recipe" | "estimate";
  /** indexes of the meals eating its leftovers (feeds) and of those whose leftovers it eats (fedBy) */
  links?: { feeds: number[]; fedBy: number[] };
}
interface Period {
  draft: { days: number; validatedAt: string | null; meals: Meal[]; remarks?: string; notes?: string; batch?: { date?: string; preparations?: string[] } } | null;
  plan: Meal[]; job: { id: string; kind: string; since: string } | null; lastError: string | null; balance?: Balance | null;
  usage: { calls: number; limit: number | null };
}
interface ShoppingResult { items: number; llm: boolean; error: string | null; remarks?: string; dropped?: string[] }

const nextMonday = () => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10); };
const shift = (x: string, n: number) => new Date(Date.parse(x + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const VIEW_KEY = "pantarr.planning.view";
const stored = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };

export default function Planning() {
  const { t, i18n } = useTranslation();
  const h = useHouseholds();
  const [start, setStart] = useState(nextMonday()), [days, setDays] = useState("7");
  const [view, setView] = useState(() => stored(VIEW_KEY, "list"));
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [watched, setWatched] = useState<string | null>(null);   // shopping job whose result is awaited
  const q = useQuery({
    queryKey: ["planning", h.current?.id, start, days], enabled: !!h.current,
    queryFn: () => api<Period>(`/households/${h.current!.id}/planning?start=${start}&days=${days}`),
    refetchInterval: (query) => (query.state.data?.job || watched ? 4000 : false),   // a job is running: read again
  });
  const base = `/households/${h.current?.id}/planning`;

  // The shopping list is prepared in the background: say what it gave once the job is over
  useEffect(() => {
    if (!watched || q.data?.job?.id === watched) return;
    let gone = false;
    api<{ status: string; error: string | null; result: ShoppingResult | null }>(`${base}/jobs/${watched}`).then((j) => {
      if (gone || j.status === "running") return;
      setWatched(null);
      if (j.status === "failed") notifications.show({ color: "red", message: `${t("planning.toShoppingFailed")} : ${t(`errors.${j.error}`, { defaultValue: j.error ?? "" })}` });
      else if (j.result && !j.result.llm) notifications.show({ color: "yellow", autoClose: 10000, message: t("planning.toShoppingNoLlm", { count: j.result.items }) });
      else notifications.show({ message: t("planning.toShoppingDone", { count: j.result?.items ?? 0 }) });
      if (j.result?.dropped?.length) notifications.show({ color: "yellow", autoClose: 12000,
        message: t("planning.toShoppingDropped", { count: j.result.dropped.length, names: j.result.dropped.join(", ") }) });
    }).catch(() => setWatched(null));
    return () => { gone = true; };
  }, [watched, q.data?.job?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!h.isLoading && !h.current) return <Alert>{t("household.none")}</Alert>;
  const act = async (path: string, body: object) => {
    try {
      const r = await api<{ shoppingJob?: string }>(`${base}/${path}`, { method: "POST", json: body });
      if (r.shoppingJob) setWatched(r.shoppingJob);
      await q.refetch();
    }
    catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
  };
  const toShopping = async () => {
    try {
      const j = await api<{ id: string }>(`/households/${h.current!.id}/shopping/from-meals`, { method: "POST", json: { start } });
      setWatched(j.id); await q.refetch();
    } catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
  };
  const d = q.data, draft = d?.draft, meals = draft?.meals ?? d?.plan ?? [];
  const editable = !!draft && !draft.validatedAt;
  /** Prepare (or redo) the menu: length of the period and free instructions for this time (guests, an absence…). */
  const propose = () => {
    let notes = draft?.notes ?? "", n = days;
    modals.openConfirmModal({ title: draft ? t("planning.regenerate") : t("planning.propose"),
      labels: { confirm: draft ? t("planning.regenerate") : t("planning.propose"), cancel: t("common.cancel") },
      children: (
        <Stack gap="sm">
          <Select label={t("planning.days")} data={["3", "5", "7", "10", "14"].map((v) => ({ value: v, label: t("planning.daysCount", { count: Number(v) }) }))}
            defaultValue={days} onChange={(v) => { if (v) n = v; }} allowDeselect={false} />
          <Textarea label={t("planning.notes")} description={t("planning.notesHelp")} placeholder={t("planning.notesExample")} autosize minRows={3} maxRows={8}
            defaultValue={notes} onChange={(e) => (notes = e.currentTarget.value)} data-autofocus />
          {draft && <Text size="sm" c="dimmed">{t("planning.regenerateConfirm")}</Text>}
        </Stack>
      ),
      onConfirm: () => { setDays(n); act("propose", { start, days: Number(n), notes }); } });
  };
  const period = () => {
    const f = (x: string) => new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(x + "T12:00:00Z"));
    return `${f(start)} – ${f(shift(start, Number(days) - 1))}`;
  };
  const dayName = (x: string, short = false) => new Intl.DateTimeFormat(i18n.language, short ? { weekday: "short", day: "numeric", timeZone: "UTC" }
    : { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(x + "T12:00:00Z"));
  const slotName = (m: Meal) => `${dayName(m.date, true)} ${t(`planning.${m.meal}`).toLowerCase()}`;

  // Change one meal ; the meals linked to it by leftovers are proposed for regeneration too (ticked by default)
  const change = (index: number) => {
    const m = meals[index];
    const linked = [...new Set([...(m.links?.feeds ?? []), ...(m.links?.fedBy ?? [])])].filter((i) => meals[i]);
    let wish = "";
    const also = new Set(linked);
    modals.openConfirmModal({ title: `${t("planning.change")} : ${m.dish}`, labels: { confirm: t("planning.change"), cancel: t("common.cancel") },
      children: (
        <Stack gap="sm">
          <TextInput label={t("planning.wish")} placeholder={t("planning.wishExample")} onChange={(e) => (wish = e.currentTarget.value)} data-autofocus />
          {linked.length > 0 && <Alert color="yellow" icon={<IconRecycle size={18} />} p="xs">
            <Stack gap={6}>
              <Text size="sm">{t("planning.linkedIntro")}</Text>
              {linked.map((i) => (
                <Checkbox key={i} defaultChecked onChange={(e) => (e.currentTarget.checked ? also.add(i) : also.delete(i))}
                  label={(m.links?.feeds ?? []).includes(i)
                    ? t("planning.linkedFeeds", { when: slotName(meals[i]), dish: meals[i].dish })
                    : t("planning.linkedFedBy", { when: slotName(meals[i]), dish: meals[i].dish })} />
              ))}
              <Text size="xs" c="dimmed">{t("planning.linkedHint")}</Text>
            </Stack>
          </Alert>}
        </Stack>
      ),
      onConfirm: () => act("change", { start, index, wish, also: [...also] }) });
  };

  const toggle = (i: number) => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const allOpen = meals.length > 0 && open.size === meals.length;
  const chooseView = (v: string) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };

  const byDay = new Map<string, [number, Meal][]>();
  meals.forEach((m, i) => byDay.set(m.date, [...(byDay.get(m.date) ?? []), [i, m]]));
  const dates = [...byDay.keys()].sort();
  const order = (a: [number, Meal], b: [number, Meal]) => (a[1].meal === "lunch" ? -1 : 1) - (b[1].meal === "lunch" ? -1 : 1);

  /** Leftovers marker, always visible: where the leftovers go, or where they come from. */
  const leftovers = (m: Meal) => {
    const to = (m.links?.feeds ?? []).map((i) => slotName(meals[i]));
    const from = (m.links?.fedBy ?? []).map((i) => slotName(meals[i]));
    if (!to.length && !from.length && !m.leftovers_for) return null;
    return (
      <Group gap={4} mt={2}>
        {to.length ? <Badge size="xs" color="teal" variant="light" leftSection={<IconRecycle size={11} />}>{t("planning.leftoversTo", { when: to.join(", ") })}</Badge>
          : m.leftovers_for ? <Badge size="xs" color="teal" variant="light" leftSection={<IconRecycle size={11} />}>{t("planning.leftovers", { when: m.leftovers_for })}</Badge> : null}
        {from.length ? <Badge size="xs" color="grape" variant="light" leftSection={<IconRecycle size={11} />}>{t("planning.leftoversFrom", { when: from.join(", ") })}</Badge> : null}
      </Group>
    );
  };
  const hasDetails = (m: Meal) => !!((m.for ?? []).length || m.minutes || (m.adjustments ?? []).length || m.note);
  const details = (m: Meal) => (
    <Stack gap={4} pt={4}>
      <Group gap={4}>
        {(m.for ?? []).map((p) => <Badge key={p} size="xs" variant="light">{p}</Badge>)}
        {m.minutes ? <Badge size="xs" variant="outline" title={t(m.minutesSource === "recipe" ? "planning.minutesRecipe" : "planning.minutesEstimate")}>
          {m.minutesSource === "recipe" ? "" : "≈ "}{m.minutes} min</Badge> : null}
      </Group>
      {(m.adjustments ?? []).map((a, k) => <Text key={k} size="sm" c="dimmed">{a.member} : {a.text}</Text>)}
      {m.note && <Text size="sm" c="dimmed">{m.note}</Text>}
    </Stack>
  );
  const warnings = (m: Meal) => (m.warnings ?? []).map((w, k) => <Alert key={k} color="red" p={6} mt={4}>{t("planning.allergyWarning", w)}</Alert>);
  const dishTitle = (m: Meal) => m.recipeUrl ? <RecipeLink url={m.recipeUrl} fw={500}>{m.dish}</RecipeLink> : <Text fw={500}>{m.dish}</Text>;
  const changeButton = (i: number) => editable
    ? <Button size="compact-xs" variant="subtle" onClick={() => change(i)} disabled={!!d?.job}>{t("planning.change")}</Button> : null;

  /** A meal of the week grid: opens its details and the change. */
  const showMeal = (i: number) => {
    const m = meals[i];
    const id = modals.open({ title: `${dayName(m.date)} · ${t(`planning.${m.meal}`)}`, children: (
      <Stack gap="xs">
        {dishTitle(m)}{leftovers(m)}{details(m)}{warnings(m)}
        {editable && <Group justify="end"><Button size="xs" variant="light" onClick={() => { modals.close(id); change(i); }} disabled={!!d?.job}>{t("planning.change")}</Button></Group>}
      </Stack>
    ) });
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t("nav.planning")}</Title>
        {d && <Badge variant="light">{t("planning.usage", { calls: d.usage.calls, limit: d.usage.limit ?? "∞" })}</Badge>}
      </Group>
      <Group align="end">
        <Group gap={4} wrap="nowrap">
          <ActionIcon variant="default" size="lg" onClick={() => setStart(shift(start, -7))} aria-label={t("planning.previous")}><IconChevronLeft size={18} /></ActionIcon>
          <Popover position="bottom" withArrow>
            <Popover.Target><Button variant="default" leftSection={<IconCalendar size={16} />}>{period()}</Button></Popover.Target>
            <Popover.Dropdown>
              <TextInput type="date" label={t("planning.from")} value={start} onChange={(e) => e.currentTarget.value && setStart(e.currentTarget.value)} />
            </Popover.Dropdown>
          </Popover>
          <ActionIcon variant="default" size="lg" onClick={() => setStart(shift(start, 7))} aria-label={t("planning.next")}><IconChevronRight size={18} /></ActionIcon>
        </Group>
        <Button onClick={propose} disabled={!!d?.job} leftSection={<IconSparkles size={16} />}>{draft ? t("planning.regenerate") : t("planning.propose")}</Button>
        {editable && <Button variant="light" color="green" onClick={() => act("validate", { start })} disabled={!!d?.job}>{t("planning.validate")}</Button>}
        {draft && <Button variant="light" onClick={toShopping} disabled={!!d?.job} loading={!!watched}>{t("planning.toShopping")}</Button>}
      </Group>
      {h.current && <NextSteps household={h.current.id} />}
      {d?.job && <Alert icon={<Loader size="xs" />}>{t(d.job.kind === "shopping" ? "planning.shoppingRunning" : "planning.running",
        { time: new Date(d.job.since).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" }) })}</Alert>}
      {d?.lastError && !d.job && <Alert color="red">{t("planning.failed")} : {t(`errors.${d.lastError}`, { defaultValue: d.lastError })}</Alert>}
      {draft?.validatedAt && <Alert color="green">{t("planning.validated")}</Alert>}
      {draft?.notes && <Alert color="blue" variant="light" title={t("planning.notes")}>{draft.notes}</Alert>}
      {draft?.remarks && <Alert color="yellow">{draft.remarks}</Alert>}
      {!meals.length && !d?.job && <Text c="dimmed">{t("planning.empty")}</Text>}
      {meals.length > 0 && <WeekInsights household={h.current!.id} balance={d?.balance ?? null} />}
      {meals.length > 0 && (
        <Group justify="space-between">
          <SegmentedControl size="xs" value={view} onChange={chooseView} data={[{ value: "list", label: t("planning.viewList") }, { value: "week", label: t("planning.viewWeek") }]} />
          {view === "list" && <Button size="compact-xs" variant="subtle" onClick={() => setOpen(allOpen ? new Set() : new Set(meals.map((_, i) => i)))}>
            {allOpen ? t("planning.foldAll") : t("planning.unfoldAll")}</Button>}
        </Group>
      )}

      {view === "week" && meals.length > 0 ? (
        <ScrollArea type="auto" offsetScrollbars>
          <Table withTableBorder withColumnBorders layout="fixed" miw={Math.max(560, dates.length * 120)} verticalSpacing="xs">
            <Table.Thead><Table.Tr>
              <Table.Th w={64} />
              {dates.map((x) => <Table.Th key={x} tt="capitalize"><Text size="sm" fw={600}>{dayName(x, true)}</Text></Table.Th>)}
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {(["lunch", "dinner"] as const).map((slot) => (
                <Table.Tr key={slot}>
                  <Table.Td><Text size="xs" c="dimmed" tt="uppercase">{t(`planning.${slot}`)}</Text></Table.Td>
                  {dates.map((x) => {
                    const cell = (byDay.get(x) ?? []).filter(([, m]) => m.meal === slot);
                    return (
                      <Table.Td key={x} style={{ verticalAlign: "top" }}>
                        {cell.map(([i, m]) => (
                          <UnstyledButton key={i} onClick={() => showMeal(i)} style={{ display: "block", width: "100%" }}>
                            <Text size="sm" fw={500} lineClamp={3}>{m.dish}</Text>
                            <Group gap={4} mt={2}>
                              {(m.links?.feeds ?? []).length > 0 && <IconRecycle size={13} color="var(--mantine-color-teal-6)" aria-label={t("planning.leftoversTo", { when: m.links!.feeds.map((k) => slotName(meals[k])).join(", ") })} />}
                              {(m.links?.fedBy ?? []).length > 0 && <IconRecycle size={13} color="var(--mantine-color-grape-6)" aria-label={t("planning.leftoversFrom", { when: m.links!.fedBy.map((k) => slotName(meals[k])).join(", ") })} />}
                              {(m.warnings ?? []).length > 0 && <Badge size="xs" color="red">{t("planning.allergyShort")}</Badge>}
                            </Group>
                          </UnstyledButton>
                        ))}
                      </Table.Td>
                    );
                  })}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {dates.map((date) => (
            <Card key={date} withBorder padding="sm">
              <Text fw={600} tt="capitalize" mb={6}>{dayName(date)}</Text>
              <Stack gap="xs">
                {byDay.get(date)!.sort(order).map(([i, m]) => (
                  <div key={i}>
                    <Group justify="space-between" wrap="nowrap" align="start" gap="xs">
                      <UnstyledButton onClick={() => hasDetails(m) && toggle(i)} style={{ flex: 1, minWidth: 0, cursor: hasDetails(m) ? "pointer" : "default" }}
                        aria-expanded={open.has(i)}>
                        <Group gap={4} wrap="nowrap" align="start">
                          {hasDetails(m) ? (open.has(i) ? <IconChevronDown size={14} style={{ marginTop: 3, flexShrink: 0 }} /> : <IconChevronRight size={14} style={{ marginTop: 3, flexShrink: 0 }} />)
                            : <span style={{ width: 14, flexShrink: 0 }} />}
                          <div style={{ minWidth: 0 }}>
                            <Text size="xs" c="dimmed" tt="uppercase">{t(`planning.${m.meal}`)}</Text>
                            {m.recipeUrl ? <RecipeLink url={m.recipeUrl} fw={500} onClick={(e) => e.stopPropagation()}>{m.dish}</RecipeLink> : <Text fw={500}>{m.dish}</Text>}
                          </div>
                        </Group>
                      </UnstyledButton>
                      {changeButton(i)}
                    </Group>
                    <div style={{ paddingLeft: 18 }}>
                      {leftovers(m)}
                      <Collapse in={open.has(i)}>{details(m)}</Collapse>
                      {warnings(m)}
                    </div>
                  </div>
                ))}
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}
      {draft?.batch?.preparations?.length ? (
        <Card withBorder><Text fw={600}>{t("planning.batch")}</Text>{draft.batch.preparations.map((p, k) => <Text key={k} size="sm">• {p}</Text>)}</Card>
      ) : null}
    </Stack>
  );
}
