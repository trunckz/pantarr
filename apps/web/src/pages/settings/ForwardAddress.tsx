// Forwarding address of the household: the mails of the stores forwarded to it go to the receipts (no access to the
// mailbox). Shown with the steps for Gmail and Outlook, and the confirmation Gmail asks first.
import { Accordion, Alert, Badge, Button, Card, Code, CopyButton, Group, List, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconCopy, IconMailForward, IconRefresh } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../api";

interface Inbound { available: boolean; address: string | null; confirmation: { code: string; link: string; account: string; at: string } | null; filter: string }

const Copy = ({ value }: { value: string }) => {
  const { t } = useTranslation();
  return <CopyButton value={value}>{({ copied, copy }) => <Button size="compact-xs" variant="subtle" leftSection={<IconCopy size={12} />} onClick={copy}>{copied ? t("common.copied") : t("common.copy")}</Button>}</CopyButton>;
};

export default function ForwardAddress({ household }: { household: string }) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["inbound", household], queryFn: () => api<Inbound>(`/households/${household}/inbound`),
    refetchInterval: (x) => (x.state.data?.address && !x.state.data.confirmation ? 15000 : false) });   // waiting for Gmail's code
  if (!q.data?.available) return null;
  const d = q.data;
  const call = async (method: "POST" | "DELETE") => {
    try { await api(`/households/${household}/inbound`, { method }); q.refetch(); }
    catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
  };
  const renew = () => modals.openConfirmModal({ title: t("inbound.renew"), children: <Text size="sm">{t("inbound.renewText")}</Text>,
    labels: { confirm: t("inbound.renew"), cancel: t("common.cancel") }, onConfirm: () => call("POST") });
  const steps = (key: string, n: number) => <List type="ordered" size="sm" spacing={6}>{Array.from({ length: n }, (_, i) => <List.Item key={i}>{t(`inbound.${key}${i + 1}`)}</List.Item>)}</List>;

  return (
    <Card withBorder>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs"><IconMailForward size={20} /><Text fw={600}>{t("inbound.title")}</Text></Group>
        <Badge color="teal" variant="light" size="sm">{t("inbound.recommended")}</Badge>
      </Group>
      <Text size="sm" c="dimmed" mt="xs">{t("inbound.intro")}</Text>
      {!d.address && <Button mt="sm" fullWidth leftSection={<IconMailForward size={16} />} onClick={() => call("POST")}>{t("inbound.create")}</Button>}
      {d.address && (
        <Stack gap="xs" mt="sm">
          <Group gap="xs" wrap="nowrap"><Code fz="sm" style={{ overflowWrap: "anywhere" }}>{d.address}</Code><Copy value={d.address} /></Group>
          {d.confirmation && (
            <Alert color="yellow" title={t("inbound.confirmTitle")}>
              <Text size="sm">{t("inbound.confirmText", { account: d.confirmation.account || "Gmail" })}</Text>
              {d.confirmation.code && <Group gap="xs" mt={4}><Code fz="lg">{d.confirmation.code}</Code><Copy value={d.confirmation.code} /></Group>}
              {d.confirmation.link && <Button mt="xs" size="xs" component="a" href={d.confirmation.link} target="_blank" rel="noopener">{t("inbound.confirmLink")}</Button>}
            </Alert>
          )}
          <Accordion variant="separated" chevronPosition="right">
            <Accordion.Item value="gmail">
              <Accordion.Control>{t("inbound.gmail")}</Accordion.Control>
              <Accordion.Panel>
                {steps("gmail", 4)}
                <Group gap="xs" mt="xs" wrap="nowrap"><Code fz="xs" style={{ overflowWrap: "anywhere" }}>{d.filter}</Code><Copy value={d.filter} /></Group>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="outlook">
              <Accordion.Control>{t("inbound.outlook")}</Accordion.Control>
              <Accordion.Panel>{steps("outlook", 3)}</Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="other">
              <Accordion.Control>{t("inbound.other")}</Accordion.Control>
              <Accordion.Panel><Text size="sm">{t("inbound.otherText")}</Text></Accordion.Panel>
            </Accordion.Item>
          </Accordion>
          <Group gap="xs">
            <Button size="xs" variant="subtle" leftSection={<IconRefresh size={14} />} onClick={renew}>{t("inbound.renew")}</Button>
            <Button size="xs" variant="subtle" color="red" onClick={() => call("DELETE")}>{t("common.delete")}</Button>
          </Group>
        </Stack>
      )}
    </Card>
  );
}
