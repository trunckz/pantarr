import { Alert, Button, Center, Paper, PasswordInput, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { LANGUAGES } from "../i18n";

export default function Setup() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", email: "", password: "" }), [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try { await api("/auth/setup", { method: "POST", json: { ...f, locale: i18n.language } }); qc.invalidateQueries(); }
    catch (err) { setError((err as Error).message); }
  };
  return (
    <Center h="100vh" p="md">
      <Paper withBorder p="xl" w={420}>
        <form onSubmit={submit}>
          <Stack>
            <Title order={3}>{t("setup.title")}</Title>
            <Text c="dimmed">{t("setup.intro")}</Text>
            {error && <Alert color="red">{error}</Alert>}
            <Select label={t("common.language")} data={Object.entries(LANGUAGES).map(([value, label]) => ({ value, label }))}
              value={i18n.language.slice(0, 2)} onChange={(v) => v && i18n.changeLanguage(v)} allowDeselect={false} />
            <TextInput label={t("common.name")} required value={f.name} onChange={(e) => setF({ ...f, name: e.currentTarget.value })} />
            <TextInput label={t("common.email")} type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.currentTarget.value })} />
            <PasswordInput label={t("common.password")} required minLength={10} value={f.password} onChange={(e) => setF({ ...f, password: e.currentTarget.value })} />
            <Button type="submit">{t("setup.submit")}</Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
