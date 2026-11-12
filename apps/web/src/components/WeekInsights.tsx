// Under the menu of a period: its balance against the public health guidelines (from the ingredients, no AI) and the
// household's budget (weekly budget set, recent spending read on the receipts).
import { Badge, Card, Group, Progress, SimpleGrid, Stack, Text, Tooltip } from "@mantine/core";
import { IconCoin, IconSalad } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api } from "../api";

export interface Balance {
  meals: number; vegetarian: number;
  guidelines: { group: string; count: number; min?: number; max?: number; status: "ok" | "low" | "high" }[];
}
export interface Budget {
  weeklyBudget: number | null;
  spending: { last7: number; last28: number; weeklyAverage: number; receipts: number; since: string | null };
  list: { known: number; total: number; items: number; priced: number; online: { known: number; items: number; priced: number }; inStore: { known: number; items: number; priced: number };
    lines: { id: string; price: number | null }[] };
}

export const money = (n: number, lang: string) => new Intl.NumberFormat(lang, { style: "currency", currency: "EUR", maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n);

export function useBudget(household: string | undefined) {
  return useQuery({ queryKey: ["budget", household], enabled: !!household, queryFn: () => api<Budget>(`/households/${household}/budget`), staleTime: 60000 });
}

export default function WeekInsights({ household, balance }: { household: string; balance: Balance | null }) {
  const { t, i18n } = useTranslation();
  const b = useBudget(household);
  const target = (g: Balance["guidelines"][number]) => (g.min !== undefined ? t("insights.atLeast", { count: g.min }) : t("insights.atMost", { count: g.max ?? 0 }));
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      {balance && (
        <Card withBorder padding="sm">
          <Group gap={6} mb={6}><IconSalad size={18} /><Text fw={600}>{t("insights.balance")}</Text>
            <Text size="xs" c="dimmed">{t("insights.vegetarian", { count: balance.vegetarian, total: balance.meals })}</Text></Group>
          <Group gap={6}>
            {balance.guidelines.map((g) => (
              <Tooltip key={g.group} label={`${t(`insights.g.${g.group}`)} : ${target(g)}`}>
                <Badge variant="light" color={g.status === "ok" ? "green" : "orange"} leftSection={g.status === "ok" ? "✓" : g.status === "low" ? "↓" : "↑"}>
                  {t(`insights.g.${g.group}`)} {g.count}{g.min !== undefined ? `/${g.min}` : ` (≤ ${g.max})`}
                </Badge>
              </Tooltip>
            ))}
          </Group>
          <Text size="xs" c="dimmed" mt={6}>{t("insights.balanceHelp")}</Text>
        </Card>
      )}
      {b.data && (
        <Card withBorder padding="sm">
          <Group gap={6} mb={6}><IconCoin size={18} /><Text fw={600}>{t("insights.budget")}</Text></Group>
          {b.data.spending.receipts > 0 ? (
            <Stack gap={4}>
              <Text size="sm">{t("insights.spent", { week: money(b.data.spending.last7, i18n.language), average: money(b.data.spending.weeklyAverage, i18n.language) })}</Text>
              {b.data.weeklyBudget ? <>
                <Progress value={Math.min(100, (b.data.spending.weeklyAverage / b.data.weeklyBudget) * 100)} color={b.data.spending.weeklyAverage > b.data.weeklyBudget ? "red" : "green"} />
                <Text size="xs" c="dimmed">{t("insights.target", { budget: money(b.data.weeklyBudget, i18n.language) })}</Text>
              </> : <Text size="xs" c="dimmed">{t("insights.noBudget")} <Link to="/settings/shopping">{t("insights.setBudget")}</Link></Text>}
            </Stack>
          ) : <Text size="sm" c="dimmed">{t("insights.noReceipts")} <Link to="/settings/stock">{t("insights.addReceipts")}</Link></Text>}
          {b.data.list.items > 0 && b.data.list.priced > 0 && (
            <Text size="sm" mt={4}>{t("insights.list", { total: money(b.data.list.total, i18n.language), priced: b.data.list.priced, count: b.data.list.items })}</Text>
          )}
        </Card>
      )}
    </SimpleGrid>
  );
}
