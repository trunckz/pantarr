import { Anchor, Button, Center, Divider, Paper, PasswordInput, Stack, Text, TextInput, Title, Alert } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconBrandGoogle, IconBrandWindows } from "@tabler/icons-react";
import { api, Status } from "../api";
import { LegalLinks } from "./Legal";

const SOCIAL_ERRORS = ["expired", "cancelled", "access_denied", "unverified", "disabled", "inviteEmail", "noAccount", "code", "otherBrowser"];

/** « Continue with Google / Microsoft »: sign-in, or sign-up carrying the invitation code / household invitation. */
function SocialButtons({ providers, code, invite, onError }: { providers: string[]; code?: string; invite?: string; onError: (m: string) => void }) {
  const { t, i18n } = useTranslation();
  if (!providers.length) return null;
  const go = async (p: string) => {
    try {
      if (code !== undefined) {
        if (!code.trim()) { onError(t("social.needCode")); return; }
        await api(`/auth/signup-code?code=${encodeURIComponent(code.trim())}`);
      }
      const q = new URLSearchParams({ locale: i18n.language, ...(code ? { code: code.trim() } : {}), ...(invite ? { invite } : {}) });
      window.location.href = `/api/v1/auth/social/${p}/start?${q}`;
    } catch (e) { onError((e as Error).message); }
  };
  return (
    <Stack gap="xs">
      {providers.includes("google") && <Button variant="default" leftSection={<IconBrandGoogle size={18} />} onClick={() => go("google")}>{t("social.google")}</Button>}
      {providers.includes("microsoft") && <Button variant="default" leftSection={<IconBrandWindows size={18} />} onClick={() => go("microsoft")}>{t("social.microsoft")}</Button>}
    </Stack>
  );
}

export default function Login({ status }: { status: Status }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState("");
  // Sign-up (hosted mode, or an invitation link « /?invite=… »), and the return of the address check (« /?verified=1 »)
  // An invitation code of a beta (« /?code=BETA-… ») opens the sign-up with the code filled in
  const params = new URLSearchParams(window.location.search), invite = params.get("invite") ?? "", verified = params.get("verified"), sharedCode = params.get("code") ?? "";
  const needsCode = status.signupMode === "code" && !invite;
  const [signup, setSignup] = useState(!!invite || ((!!sharedCode || params.has("signup")) && !!status.signup)), [name, setName] = useState(""), [household, setHousehold] = useState("");
  const [code, setCode] = useState(sharedCode);
  const [invited, setInvited] = useState<{ email: string; household: string } | null>(null), [sent, setSent] = useState(false);
  const social = status.social ?? [];
  const [reset, setReset] = useState(params.get("reset") ?? ""), [forgot, setForgot] = useState(false), [done, setDone] = useState("");
  // Back from « Continue with Google » with a refusal: say why, then clean the address
  useEffect(() => {
    if (params.get("social") !== "error") return;
    const reason = params.get("reason") ?? "";
    setError(SOCIAL_ERRORS.includes(reason) ? t(`social.errors.${reason}`) : t("social.errors.other", { reason }));
    window.history.replaceState(null, "", "/");
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (invite) api<{ email: string; household: string }>(`/auth/invite?token=${encodeURIComponent(invite)}`)
      .then((x) => { setInvited(x); setEmail(x.email); }).catch((e) => setError((e as Error).message));
  }, [invite]);
  const register = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try {
      const r = await api<{ verified: boolean }>("/auth/signup", { method: "POST", json: { email, name, password, household: household || undefined, invite: invite || undefined, code: needsCode ? code.trim() : undefined, locale: i18n.language } });
      if (r.verified) { await api("/auth/login", { method: "POST", json: { email, password } }); window.history.replaceState(null, "", "/"); qc.invalidateQueries({ queryKey: ["me"] }); }
      else setSent(true);
    } catch (err) { setError((err as Error).message); }
  };
  if (signup) return (
    <Center h="100vh" p="md">
      <Paper withBorder p="xl" w={400}>
        {sent ? <Alert color="green">{t("signup.sent", { email })}</Alert> : (
          <form onSubmit={register}>
            <Stack>
              <Title order={3} ta="center">{invited ? t("signup.joinTitle", { household: invited.household }) : t("signup.title")}</Title>
              {error && <Alert color="red">{error}</Alert>}
              {needsCode && <TextInput label={t("signup.code")} description={t("signup.codeHelp")} value={code} onChange={(e) => setCode(e.currentTarget.value.toUpperCase())} required
                autoCapitalize="characters" spellCheck={false} />}
              {social.length > 0 && <>
                <SocialButtons providers={social} code={needsCode ? code : undefined} invite={invite || undefined} onError={setError} />
                <Divider label={t("social.orEmail")} />
              </>}
              <TextInput label={t("common.name")} value={name} onChange={(e) => setName(e.currentTarget.value)} required />
              <TextInput label={t("common.email")} value={email} onChange={(e) => setEmail(e.currentTarget.value)} required disabled={!!invited} autoComplete="username" />
              <PasswordInput label={t("common.password")} description={t("signup.passwordHelp")} value={password} onChange={(e) => setPassword(e.currentTarget.value)} required minLength={10} autoComplete="new-password" />
              {!invite && <TextInput label={t("signup.household")} placeholder={t("signup.householdHint")} value={household} onChange={(e) => setHousehold(e.currentTarget.value)} />}
              <Button type="submit">{t("signup.submit")}</Button>
              <Text size="xs" c="dimmed" ta="center">{t("legal.accept")}</Text>
              {!invite && <Anchor size="sm" ta="center" onClick={() => setSignup(false)}>{t("signup.haveAccount")}</Anchor>}
              {status.mode === "hosted" && <Anchor href="/" size="sm" ta="center">{t("home.back")}</Anchor>}
              <LegalLinks />
            </Stack>
          </form>
        )}
      </Paper>
    </Center>
  );
  // Forgotten password: the address → a link by mail ; the link (« /?reset=… ») → a new password
  if (reset || forgot) return (
    <Center h="100vh" p="md">
      <Paper withBorder p="xl" w={380}>
        <form onSubmit={async (e) => {
          e.preventDefault(); setError("");
          try {
            if (reset) { await api("/auth/password/reset", { method: "POST", json: { token: reset, password } }); window.history.replaceState(null, "", "/"); setReset(""); setDone(t("password.changed")); }
            else { await api("/auth/password/forgot", { method: "POST", json: { email } }); setForgot(false); setDone(t("password.sent", { email })); }
          } catch (err) { setError((err as Error).message); }
        }}>
          <Stack>
            <Title order={3} ta="center">{t(reset ? "password.newTitle" : "password.forgotTitle")}</Title>
            {error && <Alert color="red">{error}</Alert>}
            {reset ? <PasswordInput label={t("password.new")} description={t("signup.passwordHelp")} value={password} onChange={(e) => setPassword(e.currentTarget.value)} required minLength={10} autoComplete="new-password" />
              : <><Text size="sm" c="dimmed">{t("password.forgotHelp")}</Text>
                <TextInput label={t("common.email")} value={email} onChange={(e) => setEmail(e.currentTarget.value)} required autoComplete="username" /></>}
            <Button type="submit">{t(reset ? "password.save" : "password.send")}</Button>
            <Anchor size="sm" ta="center" onClick={() => { setForgot(false); setReset(""); window.history.replaceState(null, "", "/"); }}>{t("password.back")}</Anchor>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try { await api("/auth/login", { method: "POST", json: { email, password } }); qc.invalidateQueries({ queryKey: ["me"] }); }
    catch (err) { setError((err as Error).message); }
  };
  return (
    <Center h="100vh" p="md">
      <Paper withBorder p="xl" w={380}>
        <Stack>
          <Center><img src="/favicon.svg" width={48} height={48} alt="" /></Center>
          <Title order={3} ta="center">{t("login.title")}</Title>
          {status.mode === "hosted" && <Text size="sm" c="dimmed" ta="center">{t("login.about")}</Text>}
          {verified === "1" && <Alert color="green">{t("signup.verified")}</Alert>}
          {verified === "0" && <Alert color="red">{t("signup.badLink")}</Alert>}
          {done && <Alert color="green">{done}</Alert>}
          {error && <Alert color="red">{error}</Alert>}
          {status.oidc && <Button component="a" href="/api/v1/auth/oidc/start" variant="light">{t("login.sso", { label: status.oidc.label })}</Button>}
          {status.oidc && status.localLogin && <Divider label={t("login.or")} />}
          {social.length > 0 && status.localLogin && <><SocialButtons providers={social} onError={setError} /><Divider label={t("login.or")} /></>}
          {status.localLogin && (
            <form onSubmit={submit}>
              <Stack>
                <TextInput label={t("common.email")} value={email} onChange={(e) => setEmail(e.currentTarget.value)} required autoComplete="username" />
                <PasswordInput label={t("common.password")} value={password} onChange={(e) => setPassword(e.currentTarget.value)} required autoComplete="current-password" />
                <Button type="submit">{t("login.submit")}</Button>
                <Anchor size="sm" ta="center" onClick={() => { setError(""); setForgot(true); }}>{t("password.forgot")}</Anchor>
              </Stack>
            </form>
          )}
          {status.signup && <Text size="sm" ta="center">{t("signup.noAccount")} <Anchor onClick={() => setSignup(true)}>{t("signup.create")}</Anchor></Text>}
          {status.mode === "hosted" && <Anchor href="/" size="sm" ta="center">{t("home.back")}</Anchor>}
              <LegalLinks />
        </Stack>
      </Paper>
    </Center>
  );
}
