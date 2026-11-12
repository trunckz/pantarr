// Form « Report a problem » / « Suggest an idea » when the instance sends the tickets itself (no GitHub account needed):
// the version, the instance, the page and the browser are added by the app and the server.
import { Alert, Anchor, Button, Modal, SegmentedControl, Select, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { browserName, type IssueKind } from "../feedback";

const AREAS = ["planning", "shopping", "pantry", "recipes", "extension", "connectors", "account", "other"] as const;

export default function FeedbackModal({ kind, page, onClose }: { kind: IssueKind | null; page: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [k, setK] = useState<IssueKind>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [area, setArea] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ number: number; url: string } | null>(null);
  useEffect(() => {
    if (kind) { setK(kind); setTitle(""); setDescription(""); setArea(null); setError(""); setSent(null); }
  }, [kind]);
  const ready = title.trim().length >= 3 && description.trim().length >= 10 && !!area;
  const send = async () => {
    setBusy(true); setError("");
    try {
      setSent(await api<{ number: number; url: string }>("/feedback", { method: "POST", json: {
        kind: k, title: title.trim(), description: description.trim(), area: t(`feedback.area.${area}`),
        page, browser: browserName(navigator.userAgent) } }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal opened={!!kind} onClose={onClose} title={t(k === "bug" ? "nav.reportBug" : "nav.suggestIdea")} size="lg">
      {sent ? (
        <Stack>
          <Alert color="green">{t("feedback.sent", { number: sent.number })}</Alert>
          <Anchor href={sent.url} target="_blank" rel="noopener">{t("feedback.follow")}</Anchor>
          <Button onClick={onClose}>{t("feedback.close")}</Button>
        </Stack>
      ) : (
        <Stack>
          <SegmentedControl value={k} onChange={(v) => setK(v as IssueKind)}
            data={[{ value: "bug", label: t("feedback.kindBug") }, { value: "feature", label: t("feedback.kindIdea") }]} />
          <Select label={t("feedback.areaLabel")} value={area} onChange={setArea} required allowDeselect={false}
            data={AREAS.map((a) => ({ value: a, label: t(`feedback.area.${a}`) }))} />
          <TextInput label={t("feedback.title")} placeholder={t(k === "bug" ? "feedback.titleBug" : "feedback.titleIdea")}
            value={title} onChange={(e) => setTitle(e.currentTarget.value)} maxLength={120} required />
          <Textarea label={t(k === "bug" ? "feedback.descBug" : "feedback.descIdea")} autosize minRows={5} maxRows={12}
            value={description} onChange={(e) => setDescription(e.currentTarget.value)} maxLength={5000} required />
          <Text size="xs" c="dimmed">{t("feedback.public")}</Text>
          {error && <Alert color="red">{error}</Alert>}
          <Button onClick={send} loading={busy} disabled={!ready}>{t("feedback.send")}</Button>
        </Stack>
      )}
    </Modal>
  );
}
