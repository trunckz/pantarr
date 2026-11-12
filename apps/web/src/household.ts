// Current household of the interface: remembered per browser, first one by default.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "./api";

export interface Household { id: string; name: string; locale: string; memberships: { userId: string; role?: string }[]; _count: { members: number } }
const KEY = "pantarr.household";

export function useHouseholds() {
  const q = useQuery({ queryKey: ["households"], queryFn: () => api<Household[]>("/households") });
  const [chosen, setChosen] = useState<string | null>(() => { try { return localStorage.getItem(KEY); } catch { return null; } });
  const list = q.data ?? [];
  const current = list.find((h) => h.id === chosen) ?? list[0] ?? null;
  // every user of the hook follows the choice (picker of the Settings, pages, assistant)
  useEffect(() => {
    const on = (e: Event) => setChosen((e as CustomEvent<string>).detail);
    window.addEventListener("pantarr-household", on);
    return () => window.removeEventListener("pantarr-household", on);
  }, []);
  const choose = (id: string) => { setChosen(id); try { localStorage.setItem(KEY, id); } catch { /* private mode */ } window.dispatchEvent(new CustomEvent("pantarr-household", { detail: id })); };
  return { ...q, list, current, choose };
}
