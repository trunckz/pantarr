// First minutes of a new household: one screen, three questions (how many people, which meals at home, allergies or
// diets), then the first week is planned at once and the planning page opens on it. The rest (online store, receipts,
// calendar, own recipes) comes as « next steps » on the planning page, when it is useful. The presentation of the four
// screens stays available from Settings → Household (« See the introduction again »).
import { Alert, Anchor, Button, Card, Checkbox, Chip, CloseButton, Group, Modal, NumberInput, SimpleGrid, Stack, Text, TextInput, ThemeIcon, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBasket, IconBook, IconCalendarWeek, IconPackage, IconReceipt, IconShoppingCart } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { api, type Me } from "./api";
import { useHouseholds } from "./household";
import { useSimple } from "./simple";

export const openOnboarding = () => window.dispatchEvent(new Event("pantarr-onboarding"));

const nextMonday = () => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10); };
const MEALS = ["weekLunch", "weekDinner", "weekendLunch", "weekendDinner"] as const;
const ALLERGENS = ["gluten", "milk", "eggs", "peanuts", "nuts", "fish", "crustaceans", "sesame"];
const DIETS = ["vegetarian", "vegan", "pescatarian", "no_pork", "halal", "gluten_free", "lactose_free"];
const FEATURES = [
  { key: "planning", icon: IconCalendarWeek }, { key: "shopping", icon: IconBasket }, { key: "pantry", icon: IconPackage }, { key: "recipes", icon: IconBook },
];

interface HouseholdView { settings: { onboardingDone?: boolean; nextSteps?: boolean } }

export default function Onboarding({ me }: { me: Me }) {
  const { t } = useTranslation();
  const h = useHouseholds();
  const id = h.current?.id;
  const owner = me.role === "ADMIN" || !!h.current?.memberships.some((m) => m.userId === me.id && m.role === "owner");
  const hh = useQuery({ queryKey: ["household", id], enabled: !!id, queryFn: () => api<HouseholdView>(`/households/${id}`) });
  const [tour, setTour] = useState(false), [name, setName] = useState("");
  useEffect(() => {
    const on = () => setTour(true);
    window.addEventListener("pantarr-onboarding", on);
    return () => window.removeEventListener("pantarr-onboarding", on);
  }, []);
  // an administrator without a household (a new instance): the first thing is to create one
  if (!h.isLoading && !h.list.length && me.role === "ADMIN") return (
    <Modal opened onClose={() => undefined} withCloseButton={false} title={t("onboarding.createTitle")} centered>
      <Stack>
        <Text size="sm">{t("onboarding.createText")}</Text>
        <TextInput label={t("signup.household")} placeholder={t("signup.householdHint")} value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
        <Button disabled={!name.trim()} onClick={async () => {
          try { const x = await api<{ id: string }>("/households", { method: "POST", json: { name: name.trim() } }); await h.refetch(); h.choose(x.id); }
          catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
        }}>{t("common.create")}</Button>
      </Stack>
    </Modal>
  );
  if (!id) return null;
  if (tour) return <Tour onClose={() => setTour(false)} />;
  if (owner && hh.data?.settings.onboardingDone === false) return <QuickStart id={id} me={me} />;
  return null;
}

/** The three questions, then the first week. */
function QuickStart({ id, me }: { id: string; me: Me }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const go = useNavigate();
  const simple = useSimple();
  const [adults, setAdults] = useState<number | string>(2), [children, setChildren] = useState<number | string>(0), [names, setNames] = useState("");
  const [meals, setMeals] = useState<string[]>(["weekDinner", "weekendLunch", "weekendDinner"]);
  const [allergies, setAllergies] = useState<string[]>([]), [diets, setDiets] = useState<string[]>([]), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const sensitive = allergies.length + diets.length > 0;
  const blocked = (simple && sensitive && !consent) || !meals.length;
  const done = async (settings: object) => {
    await api(`/households/${id}`, { method: "PATCH", json: { settings: { onboardingDone: true, ...settings } } });
    await qc.invalidateQueries({ queryKey: ["household", id] });
  };
  const start = async () => {
    setBusy(true);
    try {
      const a = Math.max(1, Number(adults) || 1), c = Math.max(0, Number(children) || 0);
      const given = names.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
      const people = [...Array.from({ length: a }, (_, i) => ({ kind: "adult", name: given[i] ?? (i === 0 ? me.name : t("quick.adult", { n: i + 1 })) })),
        ...Array.from({ length: c }, (_, i) => ({ kind: "child", name: given[a + i] ?? t("quick.child", { n: i + 1 }) }))];
      if (simple && sensitive) await api(`/households/${id}/health-consent`, { method: "PUT", json: { given: true } });
      const existing = await api<unknown[]>(`/households/${id}/members`);
      if (!existing.length) for (const [position, p] of people.entries())
        await api(`/households/${id}/members`, { method: "POST", json: { ...p, position, ...(sensitive ? { allergies, diets } : {}) } });
      const presence = t("quick.presence", { meals: meals.map((m) => t(`quick.meals.${m}`)).join(", "), lng: i18n.language });
      await done({ presenceRules: presence, nextSteps: true });
      try { await api(`/households/${id}/planning/propose`, { method: "POST", json: { start: nextMonday(), days: 7 } }); }
      catch (e) { notifications.show({ color: "yellow", autoClose: 12000, message: `${t("quick.proposeLater")} ${(e as Error).message}` }); }
      go("/planning");
    } catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
    setBusy(false);
  };
  return (
    <Modal opened onClose={() => undefined} withCloseButton={false} size="lg" title={t("quick.title")} closeOnClickOutside={false} closeOnEscape={false}>
      <Stack>
        <Text size="sm" c="dimmed">{t("quick.intro")}</Text>
        <div>
          <Text fw={600} mb={4}>1. {t("quick.q1")}</Text>
          <Group grow>
            <NumberInput label={t("quick.adults")} min={1} max={8} value={adults} onChange={setAdults} />
            <NumberInput label={t("quick.children")} min={0} max={8} value={children} onChange={setChildren} />
          </Group>
          <TextInput mt="xs" label={t("quick.names")} placeholder={t("quick.namesHint")} value={names} onChange={(e) => setNames(e.currentTarget.value)} />
        </div>
        <div>
          <Text fw={600} mb={4}>2. {t("quick.q2")}</Text>
          <Chip.Group multiple value={meals} onChange={setMeals}>
            <Group gap="xs">{MEALS.map((m) => <Chip key={m} value={m}>{t(`quick.meals.${m}`)}</Chip>)}</Group>
          </Chip.Group>
        </div>
        <div>
          <Text fw={600} mb={4}>3. {t("quick.q3")}</Text>
          <Chip.Group multiple value={allergies} onChange={setAllergies}>
            <Group gap={6}>{ALLERGENS.map((a) => <Chip key={a} value={a} size="xs" color="red">{t(`quick.allergen.${a}`)}</Chip>)}</Group>
          </Chip.Group>
          <Chip.Group multiple value={diets} onChange={setDiets}>
            <Group gap={6} mt={6}>{DIETS.map((d) => <Chip key={d} value={d} size="xs">{t(`quick.diet.${d}`)}</Chip>)}</Group>
          </Chip.Group>
          <Text size="xs" c="dimmed" mt={4}>{t("quick.q3Help")}</Text>
          {simple && sensitive && <Checkbox mt="xs" checked={consent} onChange={(e) => setConsent(e.currentTarget.checked)} label={t("consent.accept")} description={t("quick.consentHelp")} />}
        </div>
        <Group justify="space-between" mt="xs">
          <Anchor size="sm" c="dimmed" onClick={async () => { await done({ nextSteps: true }).catch(() => undefined); }}>{t("quick.skip")}</Anchor>
          <Button size="md" loading={busy} disabled={blocked} onClick={start}>{t("quick.go")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** The four everyday screens (asked again from the settings). */
function Tour({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal opened onClose={onClose} size="lg" title={t("onboarding.title")}>
      <Stack>
        <Text>{t("onboarding.welcomeText")}</Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {FEATURES.map((f) => (
            <Group key={f.key} align="flex-start" wrap="nowrap">
              <ThemeIcon variant="light" size="lg"><f.icon size={20} /></ThemeIcon>
              <div><Text fw={600}>{t(`onboarding.feature.${f.key}`)}</Text><Text size="sm" c="dimmed">{t(`onboarding.feature.${f.key}Text`)}</Text></div>
            </Group>
          ))}
        </SimpleGrid>
        <Alert variant="light">{t("onboarding.later")}</Alert>
        <Group justify="end"><Button onClick={onClose}>{t("onboarding.close")}</Button></Group>
      </Stack>
    </Modal>
  );
}

/** On the planning page after the three questions: what makes Pantarr more useful, each when it serves. */
export function NextSteps({ household }: { household: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const hh = useQuery({ queryKey: ["household", household], queryFn: () => api<HouseholdView>(`/households/${household}`) });
  if (!hh.data?.settings.nextSteps) return null;
  const hide = async () => {
    await api(`/households/${household}`, { method: "PATCH", json: { settings: { nextSteps: false } } }).catch(() => undefined);
    qc.invalidateQueries({ queryKey: ["household", household] });
  };
  const steps = [
    { key: "drive", icon: IconShoppingCart, to: "/settings/shopping" },
    { key: "receipts", icon: IconReceipt, to: "/settings/stock" },
    { key: "calendar", icon: IconCalendarWeek, to: "/settings/meals" },
    { key: "recipes", icon: IconBook, to: "/recipes" },
  ];
  return (
    <Card withBorder padding="sm">
      <Group justify="space-between" mb={6}><Title order={5}>{t("next.title")}</Title><CloseButton size="sm" onClick={hide} aria-label={t("next.hide")} /></Group>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="xs">
        {steps.map((s) => (
          <Group key={s.key} align="flex-start" wrap="nowrap" gap="xs">
            <ThemeIcon variant="light" size="md"><s.icon size={16} /></ThemeIcon>
            <div><Anchor component={Link} to={s.to} fw={600} size="sm">{t(`next.${s.key}`)}</Anchor><Text size="xs" c="dimmed">{t(`next.${s.key}Text`)}</Text></div>
          </Group>
        ))}
      </SimpleGrid>
    </Card>
  );
}
