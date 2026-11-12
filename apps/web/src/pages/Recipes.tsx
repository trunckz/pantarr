// The household's recipes: search, favourites, tags and categories, sort; import by address or new recipe by hand.
import { ActionIcon, Alert, Badge, Button, Card, Chip, Collapse, Group, Image, MultiSelect, NumberInput, Rating, Select, SimpleGrid, Text, TextInput, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconClock, IconDownload, IconHeartFilled, IconPlus, IconSearch } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useHouseholds } from "../household";

interface Recipe { id: string; slug: string; name: string; url: string; image: string; minutes: number | null; tags?: string[]; categories?: string[];
  added?: string | null; favorite?: boolean; rating?: number | null }

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const SORTS = ["name", "added", "rating", "minutes"] as const;

export default function Recipes() {
  const { t } = useTranslation();
  const h = useHouseholds();
  const go = useNavigate();
  const [q, setQ] = useState(""), [url, setUrl] = useState(""), [servings, setServings] = useState<number | string>(4), [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false), [favorites, setFavorites] = useState(false);
  const [tags, setTags] = useState<string[]>([]), [category, setCategory] = useState<string | null>(null), [sort, setSort] = useState<string>("name");
  const r = useQuery({ queryKey: ["recipes", h.current?.id], enabled: !!h.current, queryFn: () => api<Recipe[]>(`/households/${h.current!.id}/recipes`) });

  const importRecipe = async () => {
    setBusy(true);
    try {
      const x = await api<{ name: string; url: string; duplicate: boolean; ingredients?: number }>(`/households/${h.current!.id}/recipes/import`, { method: "POST", json: { url, servings: Number(servings) || undefined } });
      notifications.show({ color: x.duplicate ? "yellow" : "green", message: x.duplicate ? t("recipes.duplicate", { name: x.name }) : t("recipes.imported", { name: x.name, count: x.ingredients ?? 0 }) });
      setUrl(""); r.refetch();
    } catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
    setBusy(false);
  };
  // starter recipes (50 everyday dishes with a photo), added in the background: the list fills while it runs
  const [seeding, setSeeding] = useState(false);
  const addStarter = async () => {
    setSeeding(true);
    try {
      const job = await api<{ id: string; count: number }>(`/households/${h.current!.id}/recipes/starter`, { method: "POST" });
      for (let i = 0; i < 60; i++) {
        await new Promise((ok) => setTimeout(ok, 5000));
        await r.refetch();
        const j = await api<{ status: string; result?: { added: number } }>(`/households/${h.current!.id}/planning/jobs/${job.id}`);
        if (j.status !== "running") {
          notifications.show({ color: j.status === "done" ? "green" : "red", message: j.status === "done" ? t("recipes.starterDone", { count: j.result?.added ?? 0 }) : t("recipes.starterFailed") });
          break;
        }
      }
    } catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
    setSeeding(false);
  };
  const newRecipe = () => {
    let name = "";
    modals.openConfirmModal({ title: t("recipes.new"), labels: { confirm: t("common.create"), cancel: t("common.cancel") },
      children: <TextInput data-autofocus label={t("common.name")} onChange={(e) => { name = e.currentTarget.value; }} />,
      onConfirm: async () => {
        if (!name.trim()) return;
        try {
          const x = await api<{ slug: string }>(`/households/${h.current!.id}/recipes`, { method: "POST", json: { name } });
          go(`/recipes/${encodeURIComponent(x.slug)}/edit`);
        } catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
      } });
  };

  const all = useMemo(() => r.data ?? [], [r.data]);
  const tagList = useMemo(() => [...new Set(all.flatMap((x) => x.tags ?? []))].sort((a, b) => a.localeCompare(b)), [all]);
  const categoryList = useMemo(() => [...new Set(all.flatMap((x) => x.categories ?? []))].sort((a, b) => a.localeCompare(b)), [all]);
  if (!h.isLoading && !h.current) return <Alert>{t("household.none")}</Alert>;
  const words = plain(q).split(/\s+/).filter(Boolean);
  const list = all
    .filter((x) => words.every((w) => plain(x.name).includes(w) || (x.tags ?? []).some((g) => plain(g).includes(w))))
    .filter((x) => !favorites || x.favorite)
    .filter((x) => tags.every((g) => x.tags?.includes(g)))
    .filter((x) => !category || x.categories?.includes(category))
    .sort((a, b) => sort === "added" ? String(b.added ?? "").localeCompare(String(a.added ?? ""))
      : sort === "rating" ? (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name)
      : sort === "minutes" ? (a.minutes ?? 1e9) - (b.minutes ?? 1e9)
      : a.name.localeCompare(b.name));

  return (
    <>
      <Group justify="space-between" mb="md">
        <Group gap="xs"><Title order={2}>{t("nav.recipes")}</Title><Text c="dimmed">{t("recipes.count", { count: list.length })}</Text></Group>
        <Group gap="xs">
          <Button variant="light" leftSection={<IconDownload size={16} />} onClick={() => setImporting((v) => !v)}>{t("recipes.importButton")}</Button>
          <Button leftSection={<IconPlus size={16} />} onClick={newRecipe}>{t("recipes.new")}</Button>
        </Group>
      </Group>
      {r.error && <Alert color="red" mb="md">{(r.error as Error).message}</Alert>}
      <Collapse in={importing}>
        <Card withBorder mb="md">
          <Group align="end">
            <TextInput label={t("recipes.import")} description={t("recipes.importHelp")} placeholder="https://…" value={url} onChange={(e) => setUrl(e.currentTarget.value)} style={{ flex: 1, minWidth: 240 }} />
            <NumberInput label={t("recipes.servings")} min={1} max={20} value={servings} onChange={setServings} w={110} />
            <Button onClick={importRecipe} loading={busy} disabled={!url}>{t("recipes.importButton")}</Button>
          </Group>
        </Card>
      </Collapse>
      <Group mb="md" gap="xs" align="center">
        <TextInput leftSection={<IconSearch size={16} />} placeholder={t("recipes.search")} value={q} onChange={(e) => setQ(e.currentTarget.value)} style={{ flex: 1, minWidth: 200 }} maw={420} />
        <Chip checked={favorites} onChange={setFavorites} color="red" icon={<IconHeartFilled size={14} />}>{t("recipes.favorites")}</Chip>
        {tagList.length > 0 && <MultiSelect placeholder={tags.length ? undefined : t("recipes.tags")} data={tagList} value={tags} onChange={setTags} searchable clearable maw={320} />}
        {categoryList.length > 0 && <Select placeholder={t("recipes.category")} data={categoryList} value={category} onChange={setCategory} clearable searchable w={180} />}
        <Select data={SORTS.map((s) => ({ value: s, label: t(`recipes.sort.${s}`) }))} value={sort} onChange={(v) => setSort(v ?? "name")} w={170} allowDeselect={false} />
      </Group>
      {!r.isLoading && all.length < 20 && (
        <Alert mb="md" title={t("recipes.starterTitle")}>
          <Text size="sm" mb="xs">{t("recipes.starterText")}</Text>
          <Button size="xs" loading={seeding} onClick={addStarter}>{t("recipes.starterButton")}</Button>
        </Alert>
      )}
      <SimpleGrid cols={{ base: 2, sm: 3, md: 4, xl: 6 }}>
        {list.map((x) => (
          <Card key={x.id} withBorder padding="xs" component={Link} to={x.url}>
            <Card.Section pos="relative">
              <Image src={x.image} h={120} fallbackSrc="/favicon.svg" alt="" />
              {x.favorite && <ActionIcon component="span" variant="white" color="red" radius="xl" size="sm" pos="absolute" top={6} right={6} aria-label={t("recipes.favorite")}><IconHeartFilled size={14} /></ActionIcon>}
            </Card.Section>
            <Text size="sm" fw={500} mt="xs" lineClamp={2}>{x.name}</Text>
            <Group gap={6} mt={4}>
              {x.minutes ? <Badge size="xs" variant="light" leftSection={<IconClock size={10} />}>{x.minutes} min</Badge> : null}
              {x.rating ? <Rating value={x.rating} readOnly size="xs" /> : null}
            </Group>
          </Card>
        ))}
      </SimpleGrid>
    </>
  );
}
