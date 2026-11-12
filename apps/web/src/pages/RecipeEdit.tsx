// Recipe editor: name, picture, description, times, servings, ingredients (one per line, « # Section » lines for the
// sections), steps, notes, tags and categories (new ones created on save), source.
import { ActionIcon, Alert, Button, Card, FileButton, Grid, Group, Image, Loader, NumberInput, Stack, TagsInput, Text, Textarea, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowDown, IconArrowUp, IconCamera, IconPlus, IconTrash } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useHouseholds } from "../household";
import type { RecipeData } from "./RecipeView";
import { ingredientsOf, ingredientsText } from "../recipe-text";

interface Form {
  name: string; description: string; source: string; servings: number | string; yield: string;
  prepMinutes: number | string; cookMinutes: number | string; totalMinutes: number | string;
  ingredients: string; steps: { title: string; text: string }[]; notes: { title: string; text: string }[]; tags: string[]; categories: string[];
}

const formOf = (r: RecipeData): Form => ({
  name: r.name, description: r.description, source: r.source ?? "", servings: r.servings ?? "", yield: r.yield,
  prepMinutes: r.prepMinutes ?? "", cookMinutes: r.cookMinutes ?? "", totalMinutes: r.totalMinutes ?? "",
  ingredients: ingredientsText(r.ingredients), steps: r.steps.length ? r.steps : [{ title: "", text: "" }], notes: r.notes, tags: r.tags, categories: r.categories,
});
const num = (v: number | string) => (v === "" || v === null ? null : Math.round(Number(v)) || null);

export default function RecipeEdit() {
  const { t } = useTranslation();
  const { slug = "" } = useParams();
  const h = useHouseholds();
  const go = useNavigate();
  const cache = useQueryClient();
  const base = h.current ? `/households/${h.current.id}` : "";
  const q = useQuery({ queryKey: ["recipe", h.current?.id, slug], enabled: !!h.current, queryFn: () => api<RecipeData>(`${base}/recipes/${encodeURIComponent(slug)}`) });
  const organizers = useQuery({ queryKey: ["recipe-organizers", h.current?.id], enabled: !!h.current, queryFn: () => api<{ tags: string[]; categories: string[] }>(`${base}/recipe-organizers`) });
  const [f, setF] = useState<Form | null>(null), [busy, setBusy] = useState(false), [picture, setPicture] = useState(0), [uploading, setUploading] = useState(false);
  useEffect(() => { if (q.data && !f) setF(formOf(q.data)); }, [q.data, f]);
  if (q.isLoading || !h.current || (!f && !q.error)) return <Loader />;
  if (q.error) return <Alert color="red">{(q.error as Error).message}</Alert>;
  const r = q.data!, form = f!;
  const set = (patch: Partial<Form>) => setF({ ...form, ...patch });
  const setStep = (key: "steps" | "notes", k: number, patch: Partial<{ title: string; text: string }>) => set({ [key]: form[key].map((s, i) => (i === k ? { ...s, ...patch } : s)) });
  const move = (key: "steps" | "notes", k: number, by: number) => {
    const list = [...form[key]]; const [x] = list.splice(k, 1); list.splice(k + by, 0, x); set({ [key]: list });
  };

  const save = async () => {
    setBusy(true);
    try {
      const x = await api<{ slug: string }>(`${base}/recipes/${encodeURIComponent(slug)}`, { method: "PUT", json: {
        name: form.name, description: form.description, source: form.source || null, servings: num(form.servings), yield: form.yield,
        prepMinutes: num(form.prepMinutes), cookMinutes: num(form.cookMinutes), totalMinutes: num(form.totalMinutes),
        ingredients: ingredientsOf(form.ingredients), steps: form.steps.filter((s) => s.text.trim()), notes: form.notes.filter((s) => s.text.trim()),
        tags: form.tags, categories: form.categories } });
      notifications.show({ color: "green", message: t("common.saved") });
      cache.invalidateQueries({ queryKey: ["recipes", h.current?.id] });
      cache.invalidateQueries({ queryKey: ["recipe", h.current?.id] });
      cache.invalidateQueries({ queryKey: ["recipe-organizers", h.current?.id] });
      go(`/recipes/${encodeURIComponent(x.slug)}`, { replace: true });
    } catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
    setBusy(false);
  };
  const upload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData(); body.append("image", file);
      await api(`${base}/recipes/${encodeURIComponent(slug)}/image`, { method: "PUT", body });
      setPicture(Date.now());
      cache.invalidateQueries({ queryKey: ["recipes", h.current?.id] });
    } catch (e) { notifications.show({ color: "red", message: e instanceof ApiError && e.status === 413 ? t("recipeEdit.tooBig") : (e as Error).message }); }
    setUploading(false);
  };

  const list = (key: "steps" | "notes", label: string, add: string) => (
    <Card withBorder>
      <Title order={4} mb="xs">{label}</Title>
      <Stack gap="xs">
        {form[key].map((s, k) => (
          <Group key={k} align="start" gap="xs" wrap="nowrap">
            {key === "steps" && <Text fw={600} mt={6} w={22}>{k + 1}.</Text>}
            <Stack gap={4} style={{ flex: 1 }}>
              {(key === "notes" || s.title) && <TextInput size="xs" placeholder={t("recipeEdit.title")} value={s.title} onChange={(e) => setStep(key, k, { title: e.currentTarget.value })} />}
              <Textarea autosize minRows={2} value={s.text} onChange={(e) => setStep(key, k, { text: e.currentTarget.value })} />
            </Stack>
            <Stack gap={2}>
              <ActionIcon variant="subtle" disabled={k === 0} onClick={() => move(key, k, -1)} aria-label="↑"><IconArrowUp size={14} /></ActionIcon>
              <ActionIcon variant="subtle" disabled={k === form[key].length - 1} onClick={() => move(key, k, 1)} aria-label="↓"><IconArrowDown size={14} /></ActionIcon>
              <ActionIcon variant="subtle" color="red" onClick={() => set({ [key]: form[key].filter((_, i) => i !== k) })} aria-label={t("common.delete")}><IconTrash size={14} /></ActionIcon>
            </Stack>
          </Group>
        ))}
        <Group><Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={() => set({ [key]: [...form[key], { title: "", text: "" }] })}>{add}</Button></Group>
      </Stack>
    </Card>
  );

  return (
    <Stack maw={980}>
      <Group justify="space-between">
        <Title order={2}>{t("recipeEdit.heading")}</Title>
        <Group gap="xs">
          <Button variant="default" onClick={() => go(-1)}>{t("common.cancel")}</Button>
          <Button onClick={save} loading={busy} disabled={!form.name.trim()}>{t("common.save")}</Button>
        </Group>
      </Group>
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="xs">
            <Image src={`${r.image}${picture ? `${r.image.includes("?") ? "&" : "?"}v=${picture}` : ""}`} radius="md" fallbackSrc="/favicon.svg" alt="" mah={260} fit="cover" />
            <FileButton onChange={upload} accept="image/jpeg,image/png,image/webp">
              {(props) => <Button {...props} variant="light" leftSection={<IconCamera size={16} />} loading={uploading}>{t("recipeEdit.picture")}</Button>}
            </FileButton>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="xs">
            <TextInput label={t("common.name")} required value={form.name} onChange={(e) => set({ name: e.currentTarget.value })} />
            <Textarea label={t("recipeEdit.description")} autosize minRows={2} value={form.description} onChange={(e) => set({ description: e.currentTarget.value })} />
            <Group grow>
              <NumberInput label={t("recipeEdit.prep")} suffix=" min" min={0} value={form.prepMinutes} onChange={(v) => set({ prepMinutes: v })} />
              <NumberInput label={t("recipeEdit.cook")} suffix=" min" min={0} value={form.cookMinutes} onChange={(v) => set({ cookMinutes: v })} />
              <NumberInput label={t("recipeEdit.total")} description={t("recipeEdit.totalHelp")} suffix=" min" min={0} value={form.totalMinutes} onChange={(v) => set({ totalMinutes: v })} />
            </Group>
            <Group grow>
              <NumberInput label={t("recipes.servings")} min={0} max={100} value={form.servings} onChange={(v) => set({ servings: v })} />
              <TextInput label={t("recipeEdit.yield")} placeholder={t("recipeEdit.yieldPlaceholder")} value={form.yield} onChange={(e) => set({ yield: e.currentTarget.value })} />
            </Group>
            <TagsInput label={t("recipeEdit.categories")} data={organizers.data?.categories ?? []} value={form.categories} onChange={(v) => set({ categories: v })} clearable />
            <TagsInput label={t("recipeEdit.tags")} description={t("recipeEdit.tagsHelp")} data={organizers.data?.tags ?? []} value={form.tags} onChange={(v) => set({ tags: v })} clearable />
            <TextInput label={t("recipeView.source")} placeholder="https://…" value={form.source} onChange={(e) => set({ source: e.currentTarget.value })} />
          </Stack>
        </Grid.Col>
      </Grid>
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Card withBorder>
            <Title order={4} mb="xs">{t("recipeView.ingredients")}</Title>
            <Textarea description={t("recipeEdit.ingredientsHelp")} autosize minRows={8} value={form.ingredients} onChange={(e) => set({ ingredients: e.currentTarget.value })} />
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Stack>
            {list("steps", t("recipeView.steps"), t("recipeEdit.addStep"))}
            {list("notes", t("recipeEdit.notes"), t("recipeEdit.addNote"))}
          </Stack>
        </Grid.Col>
      </Grid>
      <Group justify="flex-end">
        <Button variant="default" onClick={() => go(-1)}>{t("common.cancel")}</Button>
        <Button onClick={save} loading={busy} disabled={!form.name.trim()}>{t("common.save")}</Button>
      </Group>
    </Stack>
  );
}
