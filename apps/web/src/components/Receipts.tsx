// Receipts and invoices of the household (no document manager needed): photos or PDF from the phone or the computer,
// mails of the mailbox connector, orders of the online stores; each one read into purchases (status, store, count).
import { ActionIcon, Anchor, Badge, Button, Card, Collapse, FileButton, Group, Stack, Text, Title, Tooltip, UnstyledButton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCamera, IconChevronDown, IconChevronRight, IconMail, IconRefresh, IconTrash } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";

interface Receipt { id: string; source: string; filename: string; status: "pending" | "done" | "failed" | "empty"; error: string | null; store: string | null;
  date: string | null; reader: string | null; purchases: number; createdAt: string }
const COLOR = { pending: "blue", done: "green", failed: "red", empty: "gray" } as const;

export default function Receipts({ household, onRead }: { household: string; onRead: () => void }) {
  const { t, i18n } = useTranslation();
  const base = `/households/${household}/receipts`;
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const stores = useQuery({ queryKey: ["stores", household], queryFn: () => api<{ module: string; siteUrl: string }[]>(`/households/${household}/stores`) });
  const lidl = (stores.data ?? []).find((s) => s.module === "lidl-plus");
  const q = useQuery({ queryKey: ["receipts", household], queryFn: () => api<Receipt[]>(base),
    refetchInterval: (query) => ((query.state.data ?? []).some((r) => r.status === "pending") ? 3000 : false) });
  const fail = (e: unknown) => notifications.show({ color: "red", message: (e as Error).message });
  const send = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      const r = await api<{ files: { file: string; duplicate?: boolean; error?: string }[] }>(base, { method: "POST", body: form });
      const errors = r.files.filter((f) => f.error), dup = r.files.filter((f) => f.duplicate);
      notifications.show({ color: errors.length ? "yellow" : "green", message: t("receipts.sent", { count: r.files.length - errors.length - dup.length })
        + (dup.length ? ` ${t("receipts.duplicates", { count: dup.length })}` : "") + (errors.length ? ` ${errors.map((f) => `${f.file} : ${t(`errors.${f.error}`, { defaultValue: f.error })}`).join(" ; ")}` : "") });
      setOpen(true); await q.refetch();
    } catch (e) { fail(e); }
    setBusy(false);
  };
  // Files shared from the phone (« Share » → Pantarr), kept by the service worker: sent once the page is open
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("shared") || !("caches" in window)) return;
    window.history.replaceState(null, "", window.location.pathname);
    (async () => {
      const cache = await caches.open("pantarr-shared");
      const files: File[] = [];
      for (const req of await cache.keys()) {
        const r = await cache.match(req);
        if (r) files.push(new File([await r.blob()], decodeURIComponent(r.headers.get("x-filename") ?? "partage"), { type: r.headers.get("content-type") ?? "" }));
        await cache.delete(req);
      }
      if (files.length) await send(files); else notifications.show({ color: "yellow", message: t("receipts.sharedNone") });
    })().catch(fail);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const mailbox = async (full = false) => {
    setBusy(true);
    try { const r = await api<{ mails: number; added: number; skipped?: number }>(`${base}/mailbox${full ? "?full=1" : ""}`, { method: "POST" });
      notifications.show({ message: t("receipts.mailChecked", { ...r, skipped: r.skipped ?? 0 }) }); setOpen(true); await q.refetch(); }
    catch (e) { fail(e); }
    setBusy(false);
  };
  const act = async (p: Promise<unknown>) => { try { await p; await q.refetch(); onRead(); } catch (e) { fail(e); } };
  const list = q.data ?? [];
  const day = (x: string | null) => (x ? new Date(x).toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: "numeric" }) : "");
  return (
    <Card withBorder>
      <Stack gap="xs">
        <Group justify="space-between" wrap="wrap">
          <div>
            <Title order={5}>{t("receipts.title")}</Title>
            <Text size="sm" c="dimmed">{t("receipts.intro")}</Text>
          </div>
          <Group gap="xs">
            <FileButton onChange={send} accept="image/*,application/pdf" multiple>
              {(props) => <Button {...props} loading={busy} leftSection={<IconCamera size={16} />}>{t("receipts.add")}</Button>}
            </FileButton>
            {lidl && <Tooltip label={t("receipts.lidlHelp")}><Button variant="light" component="a" href={`${lidl.siteUrl}#pantarr=${household}`} target="_blank" rel="noopener">{t("receipts.lidl")}</Button></Tooltip>}
            <Tooltip label={t("receipts.mailboxHelp")}><Button variant="light" onClick={() => mailbox()} disabled={busy} leftSection={<IconMail size={16} />}>{t("receipts.mailbox")}</Button></Tooltip>
            <Tooltip label={t("receipts.mailboxFullHelp")}><Button variant="subtle" onClick={() => mailbox(true)} disabled={busy}>{t("receipts.mailboxFull")}</Button></Tooltip>
          </Group>
        </Group>
        {list.length > 0 && (
          <UnstyledButton onClick={() => setOpen((o) => !o)}>
            <Group gap={4}>{open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              <Text size="sm" fw={500}>{t("receipts.count", { count: list.length })}</Text>
              {list.some((r) => r.status === "pending") && <Badge size="xs" color="blue">{t("receipts.status.pending")}</Badge>}
              {list.some((r) => r.status === "failed") && <Badge size="xs" color="red">{t("receipts.status.failed")}</Badge>}
            </Group>
          </UnstyledButton>
        )}
        <Collapse in={open}>
          <Stack gap={6}>
            {list.map((r) => (
              <Group key={r.id} justify="space-between" wrap="nowrap" gap="xs" py={4} style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Group gap={6} wrap="nowrap">
                    <Badge size="xs" color={COLOR[r.status]} variant="light">{t(`receipts.status.${r.status}`)}</Badge>
                    <Anchor size="sm" href={`/api/v1${base}/${r.id}/file`} target="_blank" lineClamp={1}>{r.store ?? r.filename}</Anchor>
                  </Group>
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {[day(r.date ?? r.createdAt), t(`receipts.source.${r.source}`), r.status === "done" ? t("receipts.purchases", { count: r.purchases }) : null,
                      r.reader ? t(`receipts.reader.${r.reader}`, { defaultValue: r.reader }) : null, r.error ? t(`errors.${r.error}`, { defaultValue: r.error }) : null].filter(Boolean).join(" · ")}
                  </Text>
                </div>
                <Group gap={0} wrap="nowrap">
                  {!["order", "lidl"].includes(r.source) && <Tooltip label={t("receipts.readAgain")}><ActionIcon variant="subtle" onClick={() => act(api(`${base}/${r.id}/read`, { method: "POST" }))}><IconRefresh size={16} /></ActionIcon></Tooltip>}
                  <Tooltip label={t("common.delete")}><ActionIcon variant="subtle" color="red" onClick={() => act(api(`${base}/${r.id}`, { method: "DELETE" }))}><IconTrash size={16} /></ActionIcon></Tooltip>
                </Group>
              </Group>
            ))}
          </Stack>
        </Collapse>
      </Stack>
    </Card>
  );
}
