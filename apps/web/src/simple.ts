// « Simple » interface of a hosted instance: its users are not technical, so everything that needs an address, a
// token, a prompt or a browser script is hidden (and refused by the server). A self-hosted instance shows it all.
import { useQuery } from "@tanstack/react-query";
import { api, type Status } from "./api";

export function useSimple(): boolean {
  const status = useQuery({ queryKey: ["status"], queryFn: () => api<Status>("/auth/status") });
  return status.data?.mode === "hosted";
}
