// Public demo, without an account: an invented household, its menu of the week (leftovers, a person's variant, the
// calendar), the shopping list it gives (store / online basket, prices), the balance and the stock. « Change » swaps a
// meal and the list follows, as in the real application (here without any AI call).
import { Alert, Badge, Button, Card, Container, Group, Paper, Progress, SegmentedControl, SimpleGrid, Stack, Tabs, Text, ThemeIcon, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowsShuffle, IconBasket, IconBox, IconCalendarWeek, IconClock, IconRecycle, IconSalad, IconShoppingCart, IconUsers } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { money } from "../components/WeekInsights";
import { demoData, demoList, type DemoMeal } from "./demo-data";
import { LegalLinks } from "./Legal";

const GUIDES = [
  { group: "fish", min: 2 }, { group: "oilyFish", min: 1 }, { group: "pulses", min: 2 }, { group: "redMeat", max: 4 }, { group: "coldCuts", max: 2 }, { group: "vegetables", ratio: 0.8 },
] as const;

export function DemoHeader({ signup }: { signup: boolean }) {
  const { t } = useTranslation();
  return (
    <Group justify="space-between" py="sm">
      <a href="/" style={{ textDecoration: "none", color: "inherit" }}>
        <Group gap="xs"><img src="/favicon.svg" width={30} height={30} alt="" /><Text fw={700} size="lg">Pantarr</Text></Group>
      </a>
      <Group gap="xs">
        <Button variant="subtle" component="a" href="/?login=1">{t("home.login")}</Button>
        {signup && <Button component="a" href="/?signup=1">{t("home.try")}</Button>}
      </Group>
    </Group>
  );
}

export default function Demo({ signup }: { signup: boolean }) {
  const { t, i18n } = useTranslation();
  const data = demoData(i18n.language);
  const [meals, setMeals] = useState<DemoMeal[]>(data.meals);
  const [turn, setTurn] = useState<Record<number, number>>({});
  const [area, setArea] = useState<"store" | "online">("online");
  const list = useMemo(() => demoList(meals), [meals]);
  const change = (i: number) => {
    const options = [data.meals[i], ...(data.alternatives[i] ?? [])];
    if (options.length < 2) return;
    const n = ((turn[i] ?? 0) + 1) % options.length;
    setTurn({ ...turn, [i]: n });
    setMeals(meals.map((m, k) => (k === i ? options[n] : m)));
  };
  const count = (g: string) => meals.filter((m) => m.groups.includes(g)).length;
  const shown = list.filter((x) => (area === "online" ? x.online : !x.online));
  const total = shown.reduce((n, x) => n + x.price, 0);
  return (
    <Container size="md" pb="xl">
      <DemoHeader signup={signup} />
      <Stack>
        <Alert variant="light" title={t("demo.title")}>{t("demo.intro")}</Alert>
        <Card withBorder padding="sm">
          <Group gap="xs" mb={6}><IconUsers size={18} /><Text fw={600}>{data.household}</Text></Group>
          <Group gap="xs">{data.people.map((p) => <Badge key={p.name} variant="light" size="lg" tt="none">{p.name} · {p.note}</Badge>)}</Group>
          <Text size="sm" c="dimmed" mt={6}><IconCalendarWeek size={14} style={{ verticalAlign: "-2px" }} /> {data.away}</Text>
        </Card>

        <Tabs defaultValue="menu">
          <Tabs.List grow mb="md">
            <Tabs.Tab value="menu" leftSection={<IconCalendarWeek size={16} />}>{t("demo.menu")}</Tabs.Tab>
            <Tabs.Tab value="shopping" leftSection={<IconBasket size={16} />}>{t("demo.shopping")}</Tabs.Tab>
            <Tabs.Tab value="stock" leftSection={<IconBox size={16} />}>{t("demo.stock")}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="menu">
            <Stack>
              <Card withBorder padding="sm">
                <Group gap={6} mb={6}><IconSalad size={18} /><Text fw={600}>{t("insights.balance")}</Text></Group>
                <Group gap={6}>
                  {GUIDES.map((g) => {
                    const c = count(g.group);
                    const need = "ratio" in g ? Math.ceil(meals.length * g.ratio) : undefined;
                    const ok = "min" in g ? c >= g.min : "max" in g ? c <= g.max : c >= (need ?? 0);
                    return <Badge key={g.group} variant="light" color={ok ? "green" : "orange"} leftSection={ok ? "✓" : "!"}>
                      {t(`insights.g.${g.group}`)} {c}{"min" in g ? `/${g.min}` : "max" in g ? ` (≤ ${g.max})` : `/${need}`}</Badge>;
                  })}
                </Group>
                <Text size="xs" c="dimmed" mt={6}>{t("demo.balanceHelp")}</Text>
              </Card>
              {data.days.map((day, d) => {
                const today = meals.map((m, i) => ({ m, i })).filter((x) => x.m.day === d);
                if (!today.length) return null;
                return (
                  <div key={day}>
                    <Text fw={700} tt="capitalize" mb={4}>{day}</Text>
                    <Stack gap="xs">
                      {today.map(({ m, i }) => (
                        <Paper key={i} withBorder p="sm">
                          <Group justify="space-between" wrap="nowrap" align="flex-start">
                            <div style={{ minWidth: 0 }}>
                              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{t(`demo.${m.slot}`)} · {m.for.join(", ")}</Text>
                              <Text fw={600}>{m.dish}</Text>
                              <Group gap={6} mt={4}>
                                <Badge size="sm" variant="light" leftSection={<IconClock size={11} />}>{m.minutes} min</Badge>
                                {m.leftoversFor && <Badge size="sm" color="yellow" variant="light" leftSection={<IconRecycle size={11} />}>{t("demo.leftoversFor", { when: m.leftoversFor })}</Badge>}
                                {m.leftoversFrom && <Badge size="sm" color="yellow" variant="light" leftSection={<IconRecycle size={11} />}>{t("demo.leftoversFrom", { when: m.leftoversFrom })}</Badge>}
                              </Group>
                              {m.variant && <Text size="sm" c="dimmed" mt={4}>↳ {m.variant}</Text>}
                            </div>
                            {(data.alternatives[i]?.length ?? 0) > 0 && (
                              <Button size="compact-sm" variant="light" leftSection={<IconArrowsShuffle size={14} />} onClick={() => change(i)}>{t("demo.change")}</Button>
                            )}
                          </Group>
                        </Paper>
                      ))}
                    </Stack>
                  </div>
                );
              })}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="shopping">
            <Stack>
              <SegmentedControl fullWidth value={area} onChange={(v) => setArea(v as "store" | "online")}
                data={[{ value: "online", label: t("demo.online", { count: list.filter((x) => x.online).length }) }, { value: "store", label: t("demo.store", { count: list.filter((x) => !x.online).length }) }]} />
              <Text size="sm" c="dimmed">{t("demo.listHelp")}</Text>
              {[...new Set(shown.map((x) => x.aisle))].map((aisle) => (
                <div key={aisle}>
                  <Text size="xs" tt="uppercase" c="dimmed" fw={700}>{aisle}</Text>
                  {shown.filter((x) => x.aisle === aisle).map((x) => (
                    <Group key={x.name} justify="space-between" py={6} style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
                      <Text>{x.name} <Text span c="dimmed" size="sm">{x.count > 1 ? `× ${x.count}` : x.qty}</Text></Text>
                      <Text size="sm" c="dimmed">≈ {money(x.price, i18n.language)}</Text>
                    </Group>
                  ))}
                </div>
              ))}
              <Group justify="space-between">
                <Text fw={600}>≈ {money(total, i18n.language)}</Text>
                {area === "online" && <Button leftSection={<IconShoppingCart size={16} />} onClick={() => notifications.show({ autoClose: 9000, message: t("demo.driveHelp") })}>{t("demo.toDrive")}</Button>}
              </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="stock">
            <Stack>
              <Text size="sm" c="dimmed">{data.receipts}</Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                {data.pantry.map((p) => (
                  <Card key={p.name} withBorder padding="sm">
                    <Group justify="space-between"><Text fw={600}>{p.name}</Text><Text size="sm" c={p.level < 25 ? "red" : "dimmed"}>{p.when}</Text></Group>
                    <Progress mt={6} value={p.level} color={p.level < 25 ? "red" : p.level < 50 ? "orange" : "green"} />
                  </Card>
                ))}
              </SimpleGrid>
              <Card withBorder padding="sm">
                <Text size="sm">{t("demo.budget", { spent: money(data.budget.week, i18n.language), target: money(data.budget.target, i18n.language) })}</Text>
                <Progress mt={6} value={(data.budget.week / data.budget.target) * 100} color="green" />
              </Card>
            </Stack>
          </Tabs.Panel>
        </Tabs>

        <Card withBorder padding="lg" ta="center">
          <ThemeIcon size={40} radius="xl" variant="light" mx="auto"><IconCalendarWeek size={22} /></ThemeIcon>
          <Title order={3} mt="sm">{t("demo.ctaTitle")}</Title>
          <Text c="dimmed" mt={4}>{t("demo.ctaText")}</Text>
          <Group justify="center" mt="md">
            {signup ? <Button size="md" component="a" href="/?signup=1">{t("home.try")}</Button> : <Button size="md" component="a" href="/?login=1">{t("home.login")}</Button>}
          </Group>
        </Card>
        <LegalLinks />
      </Stack>
    </Container>
  );
}
