// A recipe in Pantarr: picture, times, servings, ingredients, steps, notes, source, tags; favourite and rating of the
// household, edit, remove, and Mealie's own page when it is public.
import { ActionIcon, Alert, Anchor, Badge, Button, Card, Grid, Group, Image, List, Loader, Menu, Rating, Stack, Text, Title, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconClock, IconDots, IconExternalLink, IconHeart, IconHeartFilled, IconPencil, IconTrash, IconUsers } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useHouseholds } from "../household";

export interface RecipeData {
  id: string; slug: string; name: string; description: string; source: string | null; image: string; minutes: number | null; servings: number | null;
  yield: string; prepMinutes: number | null; cookMinutes: number | null; totalMinutes: number | null;
  ingredients: { section?: string; text: string }[]; steps: { title: string; text: string }[]; notes: { title: string; text: string }[];
  tags: string[]; categories: string[]; favorite: boolean; rating: number | null; mealieUrl: string | null;
}

export default function RecipeView() {
  const { t } = useTranslation();
  const { slug = "" } = useParams();
  const h = useHouseholds();
  const go = useNavigate();
  const cache = useQueryClient();
  const path = h.current ? `/households/${h.current.id}/recipes/${encodeURIComponent(slug)}` : "";
  const q = useQuery({ queryKey: ["recipe", h.current?.id, slug], enabled: !!h.current, queryFn: () => api<RecipeData>(path) });
  if (q.isLoading || !h.current) return <Loader />;
  if (q.error) return <Alert color="red">{(q.error as Error).message}</Alert>;
  const r = q.data!;
  const sections = [...new Set(r.ingredients.map((i) => i.section ?? ""))];

  const rate = async (change: { favorite?: boolean; rating?: number }) => {
    cache.setQueryData(["recipe", h.current?.id, slug], { ...r, ...change });
    try { await api(`${path}/rating`, { method: "PUT", json: change }); cache.invalidateQueries({ queryKey: ["recipes", h.current?.id] }); }
    catch (e) { notifications.show({ color: "red", message: (e as Error).message }); q.refetch(); }
  };
  const remove = () => modals.openConfirmModal({
    title: t("recipeView.removeTitle", { name: r.name }), children: <Text size="sm">{t("recipeView.removeText")}</Text>,
    labels: { confirm: t("common.delete"), cancel: t("common.cancel") }, confirmProps: { color: "red" },
    onConfirm: async () => {
      try { await api(path, { method: "DELETE" }); cache.invalidateQueries({ queryKey: ["recipes", h.current?.id] }); go("/recipes", { replace: true }); }
      catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
    } });
  const times = [r.prepMinutes && t("recipeView.prep", { count: r.prepMinutes }), r.cookMinutes && t("recipeView.cook", { count: r.cookMinutes })].filter(Boolean).join(" · ");

  return (
    <Stack maw={980}>
      <Group justify="space-between">
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => go(-1)}>{t("recipeView.back")}</Button>
        <Group gap="xs">
          <Tooltip label={r.favorite ? t("recipeView.unfavorite") : t("recipeView.favorite")}>
            <ActionIcon variant="light" color="red" size="lg" onClick={() => rate({ favorite: !r.favorite })} aria-label={t("recipeView.favorite")}>
              {r.favorite ? <IconHeartFilled size={18} /> : <IconHeart size={18} />}
            </ActionIcon>
          </Tooltip>
          <Button leftSection={<IconPencil size={16} />} component={Link} to={`/recipes/${encodeURIComponent(r.slug)}/edit`}>{t("recipeView.edit")}</Button>
          <Menu position="bottom-end">
            <Menu.Target><ActionIcon variant="default" size="lg" aria-label={t("common.more")}><IconDots size={18} /></ActionIcon></Menu.Target>
            <Menu.Dropdown>
              {r.mealieUrl && <Menu.Item leftSection={<IconExternalLink size={14} />} component="a" href={r.mealieUrl} target="_blank" rel="noopener">{t("recipeView.openMealie")}</Menu.Item>}
              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={remove}>{t("common.delete")}</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Image src={r.image} radius="md" fallbackSrc="/favicon.svg" alt="" mah={340} fit="cover" />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Stack gap="xs">
            <Title order={2}>{r.name}</Title>
            <Group gap="xs">
              <Rating value={r.rating ?? 0} onChange={(v) => rate({ rating: v })} />
              {r.minutes ? <Badge variant="light" leftSection={<IconClock size={12} />}>{r.minutes} min</Badge> : null}
              {r.servings ? <Badge variant="light" leftSection={<IconUsers size={12} />}>{t("recipeView.servings", { count: r.servings })}</Badge> : null}
            </Group>
            {times && <Text size="sm" c="dimmed">{times}</Text>}
            {(r.categories.length > 0 || r.tags.length > 0) && <Group gap={6}>
              {r.categories.map((x) => <Badge key={`c${x}`} variant="filled" color="teal">{x}</Badge>)}
              {r.tags.map((x) => <Badge key={x} variant="outline" color="gray">{x}</Badge>)}
            </Group>}
            {r.description && <Text c="dimmed" style={{ whiteSpace: "pre-line" }}>{r.description}</Text>}
            {r.source && <Anchor href={r.source} target="_blank" rel="noopener" size="sm">{t("recipeView.source")} <IconExternalLink size={12} /></Anchor>}
          </Stack>
        </Grid.Col>
      </Grid>
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Card withBorder>
            <Title order={4} mb="xs">{t("recipeView.ingredients")}</Title>
            {!r.ingredients.length && <Text c="dimmed" size="sm">{t("recipeView.none")}</Text>}
            {sections.map((s) => (
              <div key={s}>
                {s && <Text fw={600} size="sm" mt="xs">{s}</Text>}
                <List size="sm" spacing={4}>{r.ingredients.filter((i) => (i.section ?? "") === s).map((i, k) => <List.Item key={k}>{i.text}</List.Item>)}</List>
              </div>
            ))}
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card withBorder>
            <Title order={4} mb="xs">{t("recipeView.steps")}</Title>
            {!r.steps.length && <Text c="dimmed" size="sm">{t("recipeView.none")}</Text>}
            <List type="ordered" spacing="sm">
              {r.steps.map((s, k) => <List.Item key={k}>{s.title && <Text fw={600} size="sm">{s.title}</Text>}<Text size="sm" style={{ whiteSpace: "pre-line" }}>{s.text}</Text></List.Item>)}
            </List>
            {r.notes.length > 0 && <Stack gap={4} mt="md">{r.notes.map((n, k) => <Text key={k} size="sm" c="dimmed" style={{ whiteSpace: "pre-line" }}><b>{n.title}</b> {n.text}</Text>)}</Stack>}
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
