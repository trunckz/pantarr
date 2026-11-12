import i18n from "./i18n";

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

/** Calls the Pantarr API (session cookie), errors translated by the API from the interface language. */
export async function api<T = unknown>(path: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = options;
  const r = await fetch(`/api/v1${path}`, {
    credentials: "include",
    ...rest,
    headers: { "Accept-Language": i18n.language, ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = r.headers.get("content-type")?.includes("json") ? await r.json() : null;
  if (!r.ok) throw new ApiError(r.status, Array.isArray(data?.message) ? data.message.join(", ") : data?.message ?? r.statusText);
  return data as T;
}

export interface Me { id: string; email: string; name: string; role: "ADMIN" | "USER"; locale: string; owner?: boolean }
export interface Status { version?: string; issuesUrl?: string; feedbackForm?: boolean; setupNeeded: boolean; oidc: { label: string } | null; localLogin: boolean; languages: string[]; mode?: "self-hosted" | "hosted"; signup?: boolean; signupMode?: "open" | "code" | "closed"; billing?: boolean; social?: string[]; announcement?: string;
  plans?: { code: string; name: string; price: string; maxAccounts: number; llmMonthlyCalls: number }[];
  legal?: { operator: string; contact: string; updated: string; baseUrl: string; hosted: boolean; inboundDomain: string } }
