// Layout like the *arr apps: header with the logo, side navigation, user menu. On phones: a tab bar at the bottom for
// the four daily screens (thumb reach), the side menu (burger) keeping the settings.
import { Alert, AppShell, Burger, Group, Menu, NavLink, Text, UnstyledButton, Avatar, Anchor } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { IconApi, IconBug, IconBulb, IconShieldCheck, IconBasket, IconBook, IconCalendarWeek, IconLogout, IconPackage, IconSettings, IconUser } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NavLink as RouterLink, useLocation } from "react-router-dom";
import { api, Me, type Status } from "../api";
import { issueUrl, type IssueKind } from "../feedback";
import FeedbackModal from "./FeedbackModal";

export default function Shell({ me, announcement, children }: { me: Me; announcement?: string; children: ReactNode }) {
  const { t } = useTranslation();
  const [opened, { toggle, close }] = useDisclosure();
  const where = useLocation().pathname;
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["status"], queryFn: () => api<Status>("/auth/status") }).data;
  const issues = status?.issuesUrl;
  const [form, setForm] = useState<IssueKind | null>(null);
  // the instance sends the tickets itself (no GitHub account needed), or the link opens the prefilled GitHub form
  const report = (kind: IssueKind) => status?.feedbackForm
    ? { onClick: () => setForm(kind) }
    : { component: "a" as const, href: ticket(kind), target: "_blank", rel: "noopener" };
  const ticket = (kind: IssueKind) => issueUrl(issues!, kind, { version: status?.version, mode: status?.mode, page: where, userAgent: navigator.userAgent });
  const main = [
    { to: "/planning", label: t("nav.planningShort"), icon: IconCalendarWeek },
    { to: "/shopping", label: t("nav.shoppingShort"), icon: IconBasket },
    { to: "/pantry", label: t("nav.pantry"), icon: IconPackage },
    { to: "/recipes", label: t("nav.recipes"), icon: IconBook },
  ];
  const links = [
    { to: "/planning", label: t("nav.planning"), icon: IconCalendarWeek },
    { to: "/shopping", label: t("nav.shopping"), icon: IconBasket },
    { to: "/pantry", label: t("nav.pantry"), icon: IconPackage },
    { to: "/recipes", label: t("nav.recipes"), icon: IconBook },
    ...(me.role === "ADMIN" || me.owner ? [{ to: "/settings", label: t("nav.settings"), icon: IconSettings }] : []),
    ...(me.role === "ADMIN" ? [{ to: "/admin", label: t("nav.admin"), icon: IconShieldCheck }] : []),
  ];
  const logout = async () => { await api("/auth/logout", { method: "POST" }); qc.invalidateQueries(); };
  return (
    <AppShell header={{ height: 56 }} footer={{ height: { base: 60, sm: 0 } }} navbar={{ width: 230, breakpoint: "sm", collapsed: { mobile: !opened } }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <img src="/favicon.svg" width={28} height={28} alt="" />
            <Text fw={700} size="lg">Pantarr</Text>
            <Text c="dimmed" size="sm" visibleFrom="md">{t("app.tagline")}</Text>
          </Group>
          <Menu position="bottom-end">
            <Menu.Target>
              <UnstyledButton><Group gap={6}><Avatar size="sm" radius="xl">{me.name.slice(0, 1).toUpperCase()}</Avatar><Text size="sm" visibleFrom="xs">{me.name}</Text></Group></UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item component={RouterLink} to="/account" leftSection={<IconUser size={16} />}>{t("nav.account")}</Menu.Item>
              <Menu.Item component="a" href="/api/docs" target="_blank" leftSection={<IconApi size={16} />}>{t("nav.apiDocs")}</Menu.Item>
              {issues && <>
                <Menu.Divider />
                <Menu.Item {...report("bug")} leftSection={<IconBug size={16} />}>{t("nav.reportBug")}</Menu.Item>
                <Menu.Item {...report("feature")} leftSection={<IconBulb size={16} />}>{t("nav.suggestIdea")}</Menu.Item>
                <Menu.Divider />
              </>}
              <Menu.Item onClick={logout} leftSection={<IconLogout size={16} />}>{t("nav.logout")}</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        {links.map((l) => (
          <NavLink key={l.to} component={RouterLink} to={l.to} label={l.label} leftSection={<l.icon size={18} />}
            active={where.startsWith(l.to)} onClick={close} />
        ))}
        {issues
          ? <Anchor href={issues} target="_blank" rel="noopener" size="xs" c="dimmed" mt="auto" p="xs">Pantarr {status?.version}</Anchor>
          : <Text size="xs" c="dimmed" mt="auto" p="xs">Pantarr {status?.version}</Text>}
      </AppShell.Navbar>
      <AppShell.Main>
        <FeedbackModal kind={form} page={where} onClose={() => setForm(null)} />
        {/* message of the administrator to everyone (maintenance, news), set in Administration → Site */}
        {announcement?.trim() && <Alert variant="light" mb="md" style={{ whiteSpace: "pre-line" }}>{announcement}</Alert>}
        {children}
      </AppShell.Main>
      <AppShell.Footer hiddenFrom="sm" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <Group h="100%" grow gap={0} wrap="nowrap">
          {main.map((l) => {
            const on = where.startsWith(l.to);
            return (
              <UnstyledButton key={l.to} component={RouterLink} to={l.to} onClick={close} aria-current={on ? "page" : undefined}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: on ? "var(--mantine-primary-color-filled)" : "var(--mantine-color-dimmed)" }}>
                <l.icon size={22} stroke={on ? 2.2 : 1.6} />
                <Text size="xs" fw={on ? 600 : 400} c="inherit">{l.label}</Text>
              </UnstyledButton>
            );
          })}
        </Group>
      </AppShell.Footer>
    </AppShell>
  );
}
