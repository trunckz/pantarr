// Settings of the whole site: default language (new accounts, mails), free sign-up (self-hosted), a message shown to
// everyone (maintenance, news), and a test of the mail sending.
import { Button, Card, Group, Select, Stack, Switch, Text, Textarea, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { LANGUAGES } from "../../i18n";
import { useSimple } from "../../simple";
import { useSetting } from "./useSetting";

export default function General() {
  const { t } = useTranslation();
  const simple = useSimple();
  const s = useSetting<{ defaultLocale: string; registration: boolean; announcement?: string }>("general");
  if (!s.value) return null;
  const testMail = async () => {
    try {
      const r = await api<{ smtp: boolean; to: string }>("/admin/mail-test", { method: "POST" });
      notifications.show({ color: r.smtp ? "green" : "yellow", message: r.smtp ? t("admin.g.mailSent", { email: r.to }) : t("admin.g.noSmtp") });
    } catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
  };
  return (
    <Stack maw={640}>
      <Card withBorder>
        <Stack>
          <Select label={t("settings.defaultLocale")} description={t("admin.g.localeHelp")} data={Object.entries(LANGUAGES).map(([value, label]) => ({ value, label }))}
            value={s.value.defaultLocale} onChange={(v) => v && s.set({ defaultLocale: v })} allowDeselect={false} />
          {/* hosted: the sign-up is set by the platform (open, by invitation code, closed) */}
          {!simple && <Switch label={t("settings.registration")} checked={s.value.registration} onChange={(e) => s.set({ registration: e.currentTarget.checked })} />}
          <Textarea label={t("admin.g.announcement")} description={t("admin.g.announcementHelp")} autosize minRows={2} maxLength={1000}
            value={s.value.announcement ?? ""} onChange={(e) => s.set({ announcement: e.currentTarget.value })} />
          <Group><Button onClick={s.save}>{t("common.save")}</Button></Group>
        </Stack>
      </Card>
      <Card withBorder>
        <Title order={5}>{t("admin.g.mail")}</Title>
        <Text size="sm" c="dimmed" mb="xs">{t("admin.g.mailHelp")}</Text>
        <Group><Button variant="light" onClick={testMail}>{t("admin.g.mailTest")}</Button></Group>
      </Card>
    </Stack>
  );
}
