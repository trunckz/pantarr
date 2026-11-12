import { Badge, Button, Card, Group, PasswordInput, Select, Stack, Switch, Table, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";

interface U { id: string; email: string; name: string; role: "ADMIN" | "USER"; disabled: boolean; oidcSubject: string | null; lastLoginAt: string | null }

export default function Users() {
  const { t, i18n } = useTranslation();
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<U[]>("/users") });
  const [n, setN] = useState({ name: "", email: "", password: "", role: "USER" });
  const run = async (p: Promise<unknown>) => { try { await p; users.refetch(); } catch (e) { notifications.show({ color: "red", message: (e as Error).message }); } };
  const roles = [{ value: "USER", label: t("common.user") }, { value: "ADMIN", label: t("common.admin") }];
  return (
    <Stack maw={900}>
      <Card withBorder>
        <Table>
          <Table.Thead><Table.Tr><Table.Th>{t("common.name")}</Table.Th><Table.Th>{t("common.email")}</Table.Th><Table.Th>{t("common.role")}</Table.Th><Table.Th>{t("users.disabled")}</Table.Th><Table.Th /></Table.Tr></Table.Thead>
          <Table.Tbody>
            {(users.data ?? []).map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td>{u.name} {u.oidcSubject && <Badge size="xs" variant="light">{t("users.sso")}</Badge>}</Table.Td>
                <Table.Td>{u.email}<br /><small>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString(i18n.language) : t("common.never")}</small></Table.Td>
                <Table.Td><Select data={roles} value={u.role} allowDeselect={false} w={170} onChange={(role) => run(api(`/users/${u.id}`, { method: "PATCH", json: { role } }))} /></Table.Td>
                <Table.Td><Switch checked={u.disabled} onChange={(e) => run(api(`/users/${u.id}`, { method: "PATCH", json: { disabled: e.currentTarget.checked } }))} /></Table.Td>
                <Table.Td><Button size="xs" color="red" variant="subtle" onClick={() => run(api(`/users/${u.id}`, { method: "DELETE" }))}>{t("common.delete")}</Button></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
      <Card withBorder>
        <Group align="end">
          <TextInput label={t("common.name")} value={n.name} onChange={(e) => setN({ ...n, name: e.currentTarget.value })} />
          <TextInput label={t("common.email")} value={n.email} onChange={(e) => setN({ ...n, email: e.currentTarget.value })} />
          <PasswordInput label={t("common.password")} value={n.password} onChange={(e) => setN({ ...n, password: e.currentTarget.value })} />
          <Select label={t("common.role")} data={roles} value={n.role} onChange={(v) => v && setN({ ...n, role: v })} allowDeselect={false} w={170} />
          <Button onClick={() => run(api("/users", { method: "POST", json: { ...n, password: n.password || undefined } }).then(() => setN({ name: "", email: "", password: "", role: "USER" })))}
            disabled={!n.name || !n.email}>{t("users.add")}</Button>
        </Group>
      </Card>
    </Stack>
  );
}
