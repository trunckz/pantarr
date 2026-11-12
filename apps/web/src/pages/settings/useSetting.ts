import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";

/** Reads a global setting, keeps a local copy for the form, saves it. */
export function useSetting<T extends Record<string, unknown>>(key: string) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["setting", key], queryFn: () => api<T>(`/settings/${key}`) });
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => { if (q.data) setValue(q.data); }, [q.data]);
  const save = async () => {
    try { setValue(await api<T>(`/settings/${key}`, { method: "PUT", json: value })); notifications.show({ message: t("common.saved") }); }
    catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
  };
  return { value, set: (patch: Partial<T>) => setValue((v) => ({ ...(v as T), ...patch })), save };
}
