// The starter recipes (50 everyday dishes of 30 minutes at most, with a photo), added in the background: those already
// there are kept. Used by the Settings (Recipes tab) and by the start-up assistant.
import { Button, Card, Group, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";

export default function StarterRecipes({ household }: { household: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const r = useQuery({ queryKey: ["recipes", household], queryFn: () => api<unknown[]>(`/households/${household}/recipes`), retry: false });
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      const job = await api<{ id: string }>(`/households/${household}/recipes/starter`, { method: "POST" });
      for (let i = 0; i < 60; i++) {
        await new Promise((ok) => setTimeout(ok, 5000));
        await qc.invalidateQueries({ queryKey: ["recipes", household] });
        const j = await api<{ status: string; result?: { added: number } }>(`/households/${household}/planning/jobs/${job.id}`);
        if (j.status !== "running") {
          notifications.show({ color: j.status === "done" ? "green" : "red", message: j.status === "done" ? t("recipes.starterDone", { count: j.result?.added ?? 0 }) : t("recipes.starterFailed") });
          break;
        }
      }
    } catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
    setBusy(false);
  };
  return (
    <Card withBorder>
      <Title order={4}>{t("recipes.starterTitle")}</Title>
      <Text size="sm" c="dimmed" mb="xs">{t("recipes.starterText")}</Text>
      {r.data && <Text size="sm" mb="xs">{t("recipes.count", { count: r.data.length })}</Text>}
      <Group><Button loading={busy} onClick={add}>{t("recipes.starterButton")}</Button></Group>
    </Card>
  );
}
