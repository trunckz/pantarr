// Receipts by forwarded e-mail: each household has its own address (<code>@PANTARR_INBOUND_DOMAIN). The user's mail
// service forwards the mails of the stores to it (a Gmail filter, an Outlook rule…), the domain's mail service posts
// them raw to Pantarr, and they go to the receipts inbox like the mails read from Gmail or IMAP. No access to the
// user's mailbox at all. Mail services ask to confirm a forwarding address first: Gmail sends a code and a link to it,
// kept and shown to the household.
import { randomBytes } from "node:crypto";
import { config } from "../config";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";   // no 0/o, 1/l/i: read and typed by people

/** A new address code: 12 characters, hard to guess (the address is the only key). */
export function newCode(): string {
  return [...randomBytes(12)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const addressOf = (code: string) => `${code}@${config.inbound.domain}`;

/** Code of a recipient address of the instance's domain (« Tickets <AbCd…@tickets.example.com> » → « abcd… »). */
export function recipientCode(to: string, domain = config.inbound.domain): string | null {
  const m = String(to).toLowerCase().match(/([a-z0-9]+)@([a-z0-9.-]+)/);
  return m && domain && m[2] === domain && /^[a-z0-9]{8,40}$/.test(m[1]) ? m[1] : null;
}

/** Confirmation asked by Gmail before forwarding: its code (in the subject) and its link, with the asking account. */
export function gmailConfirmation(from: string, subject: string, text: string): { code: string; link: string; account: string } | null {
  if (!/forwarding-noreply@google\.com/i.test(from)) return null;
  const code = subject.match(/#\s*(\d{6,12})/)?.[1] ?? text.match(/\b(\d{9})\b/)?.[1] ?? "";
  const link = text.match(/https:\/\/mail(?:-settings)?\.google\.com\/mail\/[^\s<>"]+/)?.[0] ?? "";
  const account = (subject.match(/[\w.+-]+@[\w.-]+\.\w+/) ?? text.match(/[\w.+-]+@gmail\.com/))?.[0] ?? "";
  return code || link ? { code, link, account } : null;
}

/** « From » field of the forwarding filter (Gmail, Outlook): the usual French stores. */
export const STORE_FILTER = "leclerc OR intermarche OR carrefour OR auchan OR coursesu OR magasins-u OR chronodrive OR monoprix OR franprix OR lidl OR aldi OR picard OR casino OR cora OR grandfrais OR biocoop OR naturalia";
