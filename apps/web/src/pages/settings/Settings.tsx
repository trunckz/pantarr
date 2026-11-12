// Settings of the household, by use: meals first (what is changed most), then shopping, stock and recipes ; the
// household itself (name, people, accounts, subscription) last, rarely touched. Each tab also holds the connectors
// that feed it (calendars for the meals, online stores and shared lists for the shopping, receipts for the stock).
// What concerns the whole site is in the Administration.
import { Alert, Button, Card, Group, Stack, Tabs, Text, Title } from "@mantine/core";
import { IconBasket, IconBox, IconCalendarEvent, IconChefHat, IconHome } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Me, Status } from "../../api";
import { useHouseholds } from "../../household";
import { openOnboarding } from "../../onboarding";
import Billing from "./Billing";
import Connectors from "./Connectors";
import Households, { Aisles, HouseholdAccounts, HouseholdCard, Members, PlanningSettings, Preferences, ShoppingSettings, StockSettings } from "./Households";
import StarterRecipes from "./StarterRecipes";

export default function Settings({ me, status }: { me: Me; status: Status }) {
  const { t } = useTranslation();
  const tab = useParams()["*"] || "meals";
  const go = useNavigate();
  const qc = useQueryClient();
  const h = useHouseholds();
  const id = h.current?.id;
  const admin = me.role === "ADMIN";
  return (
    <Stack maw={1100}>
      <Group justify="space-between" align="end">
        <Title order={2}>{t("settings.title")}</Title>
        <Households me={me} />
      </Group>
      {!id ? <Alert>{t("household.none")}</Alert> : (
        <Tabs value={tab} onChange={(v) => go(`/settings/${v}`)} keepMounted={false}>
          <Tabs.List mb="md">
            <Tabs.Tab value="meals" leftSection={<IconCalendarEvent size={16} />}>{t("settingsTabs.meals")}</Tabs.Tab>
            <Tabs.Tab value="shopping" leftSection={<IconBasket size={16} />}>{t("settingsTabs.shopping")}</Tabs.Tab>
            <Tabs.Tab value="stock" leftSection={<IconBox size={16} />}>{t("settingsTabs.stock")}</Tabs.Tab>
            <Tabs.Tab value="recipes" leftSection={<IconChefHat size={16} />}>{t("settingsTabs.recipes")}</Tabs.Tab>
            <Tabs.Tab value="household" leftSection={<IconHome size={16} />}>{t("settingsTabs.household")}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="meals"><Stack>
            <PlanningSettings id={id} />
            <Section title={t("settingsTabs.calendars")} intro={t("settingsTabs.calendarsIntro")}><Connectors kinds={["calendar"]} embedded /></Section>
          </Stack></Tabs.Panel>
          <Tabs.Panel value="shopping"><Stack>
            <ShoppingSettings id={id} />
            <Section title={t("settingsTabs.stores")} intro={t("settingsTabs.storesIntro")}><Connectors kinds={["cart", "list-sync"]} embedded /></Section>
            <Aisles id={id} />
            <Preferences id={id} />
          </Stack></Tabs.Panel>
          <Tabs.Panel value="stock"><Stack>
            <Section title={t("settingsTabs.receipts")} intro={t("settingsTabs.receiptsIntro")}><Connectors kinds={["documents", "purchases", "inventory"]} embedded /></Section>
            <StockSettings id={id} />
          </Stack></Tabs.Panel>
          <Tabs.Panel value="recipes"><Stack>
            <StarterRecipes household={id} />
            <Card withBorder><Text size="sm">{t("settingsTabs.recipesHelp")} <Link to="/recipes">{t("nav.recipes")}</Link></Text></Card>
          </Stack></Tabs.Panel>
          <Tabs.Panel value="household"><Stack>
            <HouseholdCard id={id} admin={admin} onChange={() => qc.invalidateQueries({ queryKey: ["households"] })} />
            <Members id={id} />
            <HouseholdAccounts id={id} />
            {status.billing && <Billing me={me} />}
            <Group><Button variant="light" onClick={openOnboarding}>{t("onboarding.again")}</Button></Group>
          </Stack></Tabs.Panel>
        </Tabs>
      )}
    </Stack>
  );
}

function Section({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <Stack gap="xs">
      <div><Title order={4}>{title}</Title><Text size="sm" c="dimmed">{intro}</Text></div>
      {children}
    </Stack>
  );
}
