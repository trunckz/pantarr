import { Button, Card, Code, Group, PasswordInput, Stack, Switch, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useSetting } from "./useSetting";

interface Oidc { enabled: boolean; issuer: string; clientId: string; clientSecret: string; scopes: string; groupsClaim: string; adminGroup: string; buttonLabel: string; localLogin: boolean; [k: string]: unknown }

export default function Sso() {
  const { t } = useTranslation();
  const s = useSetting<Oidc>("oidc");
  if (!s.value) return null;
  const v = s.value;
  const text = (key: keyof Oidc, label: string) => (
    <TextInput label={label} value={String(v[key] ?? "")} onChange={(e) => s.set({ [key]: e.currentTarget.value } as Partial<Oidc>)} />
  );
  return (
    <Card withBorder maw={640}>
      <Stack>
        <Switch label={t("sso.enabled")} checked={v.enabled} onChange={(e) => s.set({ enabled: e.currentTarget.checked })} />
        {text("issuer", t("sso.issuer"))}
        {text("clientId", t("sso.clientId"))}
        <PasswordInput label={t("sso.clientSecret")} value={v.clientSecret} onChange={(e) => s.set({ clientSecret: e.currentTarget.value })} />
        {text("scopes", t("sso.scopes"))}
        {text("groupsClaim", t("sso.groupsClaim"))}
        {text("adminGroup", t("sso.adminGroup"))}
        {text("buttonLabel", t("sso.buttonLabel"))}
        <Switch label={t("sso.localLogin")} checked={v.localLogin} onChange={(e) => s.set({ localLogin: e.currentTarget.checked })} />
        <Text size="sm">{t("sso.redirect")} : <Code>{window.location.origin}/api/v1/auth/oidc/callback</Code></Text>
        <Group><Button onClick={s.save}>{t("common.save")}</Button></Group>
      </Stack>
    </Card>
  );
}
