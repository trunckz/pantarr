// Public home page of a hosted instance (visitors not signed in): what Pantarr does for a family in a few seconds,
// a demo without an account, the plans, the questions people ask. A self-hosted instance goes straight to sign-in.
import { Accordion, Badge, Button, Card, Container, Group, List, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconBasket, IconCalendarWeek, IconCheck, IconChefHat, IconCoin, IconLock, IconReceipt, IconRecycle, IconSalad, IconShoppingCart, IconUsers } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { Status } from "../api";
import { DemoHeader } from "./Demo";
import { LegalLinks } from "./Legal";

const STEPS = [
  { key: "menu", icon: IconCalendarWeek },
  { key: "list", icon: IconBasket },
  { key: "drive", icon: IconShoppingCart },
];
const WHY = [
  { key: "people", icon: IconUsers }, { key: "leftovers", icon: IconRecycle }, { key: "recipes", icon: IconChefHat },
  { key: "stock", icon: IconReceipt }, { key: "balance", icon: IconSalad }, { key: "budget", icon: IconCoin },
];
const FAQ = ["stores", "phone", "ai", "data", "cancel"];

/** A small picture of a menu, made of the interface's own pieces (no screenshot to keep up to date). */
function Preview() {
  const { t } = useTranslation();
  const rows = [0, 1, 2].map((i) => ({ day: t(`home.preview.day${i}`), dish: t(`home.preview.dish${i}`), note: t(`home.preview.note${i}`) }));
  return (
    <Paper withBorder shadow="md" p="md" radius="md">
      <Group justify="space-between" mb="xs"><Text fw={700}>{t("home.preview.title")}</Text><Badge color="green" variant="light">{t("home.preview.ready")}</Badge></Group>
      <Stack gap={8}>
        {rows.map((r) => (
          <div key={r.day}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{r.day}</Text>
            <Text fw={600}>{r.dish}</Text>
            <Text size="xs" c="dimmed">{r.note}</Text>
          </div>
        ))}
      </Stack>
      <Group mt="sm" gap={6}>
        <Badge variant="light" leftSection={<IconBasket size={12} />}>{t("home.preview.list")}</Badge>
        <Badge variant="light" color="teal" leftSection={<IconShoppingCart size={12} />}>{t("home.preview.drive")}</Badge>
      </Group>
    </Paper>
  );
}

export default function Home({ status }: { status: Status }) {
  const { t } = useTranslation();
  const signup = !!status.signup;
  const plans = status.plans ?? [];
  return (
    <Container size="lg" pb="xl">
      <DemoHeader signup={signup} />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" py={{ base: "lg", md: 48 }} style={{ alignItems: "center" }}>
        <Stack>
          <Title order={1} style={{ fontSize: "clamp(2rem, 5vw, 3rem)", lineHeight: 1.1 }}>{t("home.title")}</Title>
          <Text size="lg" c="dimmed">{t("home.subtitle")}</Text>
          <Group>
            {signup && <Button size="lg" component="a" href="/?signup=1">{t("home.try")}</Button>}
            <Button size="lg" variant="light" component="a" href="/demo">{t("home.demo")}</Button>
          </Group>
          <Text size="sm" c="dimmed">{t(signup ? (status.signupMode === "code" ? "home.trustCode" : "home.trust") : "home.trustClosed")}</Text>
        </Stack>
        <Preview />
      </SimpleGrid>

      <Title order={2} ta="center" mt="xl" mb="md">{t("home.howTitle")}</Title>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        {STEPS.map((s, i) => (
          <Card key={s.key} withBorder padding="lg">
            <Group gap="sm"><ThemeIcon size={36} radius="xl" variant="light"><s.icon size={20} /></ThemeIcon><Text fw={700}>{i + 1}. {t(`home.step.${s.key}`)}</Text></Group>
            <Text size="sm" c="dimmed" mt="xs">{t(`home.step.${s.key}Text`)}</Text>
          </Card>
        ))}
      </SimpleGrid>

      <Title order={2} ta="center" mt={48} mb="md">{t("home.whyTitle")}</Title>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
        {WHY.map((w) => (
          <Group key={w.key} align="flex-start" wrap="nowrap">
            <ThemeIcon variant="light" size="lg"><w.icon size={20} /></ThemeIcon>
            <div><Text fw={600}>{t(`home.why.${w.key}`)}</Text><Text size="sm" c="dimmed">{t(`home.why.${w.key}Text`)}</Text></div>
          </Group>
        ))}
      </SimpleGrid>

      <Card withBorder padding="lg" mt={48}>
        <Group align="flex-start" wrap="nowrap">
          <ThemeIcon size={40} radius="xl" variant="light" color="teal"><IconLock size={22} /></ThemeIcon>
          <div>
            <Text fw={700}>{t("home.privacyTitle")}</Text>
            <List size="sm" spacing={4} mt={4} icon={<IconCheck size={14} />}>
              {[0, 1, 2, 3].map((i) => <List.Item key={i}>{t(`home.privacy${i}`)}</List.Item>)}
            </List>
          </div>
        </Group>
      </Card>

      {plans.length > 0 && <>
        <Title order={2} ta="center" mt={48} mb="md">{t("home.plansTitle")}</Title>
        <SimpleGrid cols={{ base: 1, sm: Math.min(3, plans.length) }}>
          {plans.map((p) => (
            <Card key={p.code} withBorder padding="lg">
              <Text fw={700} size="lg">{p.name}</Text>
              <Text fw={700} size="xl" mt={4}>{p.price === "0" ? t("home.free") : p.price}</Text>
              <List size="sm" spacing={4} mt="sm" icon={<IconCheck size={14} />}>
                <List.Item>{t("home.planAccounts", { count: p.maxAccounts })}</List.Item>
                <List.Item>{t("home.planMenus", { count: p.llmMonthlyCalls })}</List.Item>
                <List.Item>{t("home.planAll")}</List.Item>
              </List>
            </Card>
          ))}
        </SimpleGrid>
      </>}

      <Title order={2} ta="center" mt={48} mb="md">{t("home.faqTitle")}</Title>
      <Accordion variant="separated" maw={760} mx="auto">
        {FAQ.map((q) => (
          <Accordion.Item key={q} value={q}>
            <Accordion.Control>{t(`home.faq.${q}`)}</Accordion.Control>
            <Accordion.Panel><Text size="sm">{t(`home.faq.${q}Text`)}</Text></Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>

      <Stack align="center" mt={48} gap="sm">
        <Title order={3} ta="center">{t("home.lastTitle")}</Title>
        <Group>
          {signup && <Button size="md" component="a" href="/?signup=1">{t("home.try")}</Button>}
          <Button size="md" variant="light" component="a" href="/demo">{t("home.demo")}</Button>
        </Group>
        <LegalLinks />
      </Stack>
    </Container>
  );
}
