// ==UserScript==
// @name         Pantarr — Lidl Plus
// @namespace    __PANTARR_API__
// @version      __VERSION__
// @description  Sends your Lidl Plus digital receipts to Pantarr (purchase history), from your own Lidl account.
// __MATCHES__
// @run-at       document-idle
// @grant        none
// @downloadURL  __PANTARR_API__/bridge/lidl-plus/userscript.user.js?k=__PANTARR_KEY__&h=__HOUSEHOLD__
// @updateURL    __PANTARR_API__/bridge/lidl-plus/userscript.user.js?k=__PANTARR_KEY__&h=__HOUSEHOLD__
// ==/UserScript==
// Pantarr browser bridge for Lidl Plus: the digital receipts shown in your Lidl account on the Lidl website are read
// with your own session (in your browser, as the site itself does), and the new ones are sent to Pantarr. It runs at
// most every 6 hours when you visit the Lidl site while signed in, or right away when opened from Pantarr.

/* ── Pure helpers (also loaded by the unit tests) ── */
const COUNTRIES = { fr: "FR", de: "DE", "co.uk": "GB", ie: "IE", es: "ES", it: "IT", be: "BE", nl: "NL", at: "AT", ch: "CH", pl: "PL", pt: "PT", cz: "CZ",
  sk: "SK", hu: "HU", ro: "RO", bg: "BG", hr: "HR", si: "SI", dk: "DK", se: "SE", fi: "FI", gr: "GR", lt: "LT", lv: "LV", ee: "EE", rs: "RS", cy: "CY", mt: "MT", lu: "LU" };

/** Country code of a Lidl site from its host name (www.lidl.fr → FR, www.lidl.co.uk → GB). */
function countryOf(host) {
  const m = String(host).match(/lidl\.(co\.uk|[a-z]{2})$/i);
  return m ? COUNTRIES[m[1].toLowerCase()] || m[1].toUpperCase() : "FR";
}

/** Items of a printed receipt (HTML): one per « span.article » (weight lines skipped), discounts on the item above. */
function itemsOf(html, parse) {
  const doc = parse(html);
  const out = [];
  for (const el of doc.querySelectorAll("span.article, span.discount")) {
    if (el.classList.contains("discount")) {
      const m = (el.textContent || "").match(/-\s*\d+[.,]\d{2}/);
      if (m && out.length) out[out.length - 1].discount = Math.round((out[out.length - 1].discount + parseFloat(m[0].replace(/\s/g, "").replace(",", "."))) * 100) / 100;
      continue;
    }
    if (/\d+[.,]\d+\s*kg\s*[@x×]/i.test(el.textContent || "")) continue;   // « 0,692 kg x 1,19 €/kg »: the item is already counted
    const name = el.getAttribute("data-art-description");
    if (!name) continue;
    const q = parseFloat(String(el.getAttribute("data-art-quantity") || "1").replace(",", "."));
    const unit = parseFloat(String(el.getAttribute("data-unit-price") || "").replace(",", "."));
    const weighed = !Number.isInteger(q);
    out.push({ name: name.trim() + (weighed ? " (" + String(q).replace(".", ",") + " kg)" : ""), quantity: weighed ? 1 : q || 1,
      unitPrice: isNaN(unit) ? null : weighed ? Math.round(unit * q * 100) / 100 : unit, discount: 0 });
  }
  return out;
}

if (typeof module !== "undefined") module.exports = { countryOf, itemsOf };

/* ── In the browser ── */
if (typeof window !== "undefined" && typeof document !== "undefined") (() => {
  const API = "__PANTARR_API__", AUTH = { Authorization: "Bearer __PANTARR_KEY__" };
  const KEY = "pantarr:lidl-plus";
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  const memo = read();
  const opened = location.hash.match(/#pantarr=([a-z0-9]+)$/i);
  if (opened) { memo.household = opened[1]; history.replaceState(null, "", location.pathname + location.search); }
  if (!memo.household && "__HOUSEHOLD__" && !"__HOUSEHOLD__".startsWith("__")) memo.household = "__HOUSEHOLD__";
  if (!memo.household) return;
  write(memo);
  if (!opened && memo.lastRun && Date.now() - memo.lastRun < 6 * 3600e3) return;   // at most every 6 hours
  const country = countryOf(location.hostname);
  const language = (document.documentElement.lang || "").includes("-") ? document.documentElement.lang : (document.documentElement.lang || country.toLowerCase()) + "-" + country;
  const pantarr = (path, body) => fetch(API + "/bridge/lidl-plus/" + path + "?household=" + memo.household,
    { method: "POST", headers: Object.assign({ "content-type": "application/json" }, AUTH), body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error("Pantarr " + r.status); return r.json(); });
  const lidl = (path) => fetch(path, { credentials: "include", headers: { accept: "application/json" } });

  let note = null;
  const say = (text, stay) => {
    if (!note) {
      note = document.createElement("div");
      note.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483647;max-width:340px;background:#fff;color:#111;font:13px sans-serif;border-left:4px solid #2f9e44;border-radius:8px;padding:10px 12px;box-shadow:0 2px 12px rgba(0,0,0,.25)";
      document.body.appendChild(note);
    }
    note.textContent = "Pantarr : " + text;
    if (!stay) setTimeout(() => { if (note) { note.remove(); note = null; } }, 8000);
  };

  (async () => {
    const since = Date.now() - (memo.lastRun ? 60 : 365) * 864e5;   // the first time, one year back
    const fresh = [];
    for (let page = 1; page <= 20 && fresh.length < 40; page++) {
      const r = await lidl("/mre/api/v1/tickets?country=" + country + "&page=" + page);
      if (r.status === 401 || r.status === 403) { if (opened) say("connectez-vous à votre compte Lidl sur ce site, puis rouvrez-le depuis Pantarr.", true); return; }
      if (!r.ok) { if (opened) say("tickets Lidl indisponibles (" + r.status + ").", true); return; }
      const items = ((await r.json()).items || []).filter((t) => t && t.id);
      if (!items.length) break;
      const recent = items.filter((t) => Date.parse(t.date) >= since);
      const unknown = recent.length ? (await pantarr("unknown", { ids: recent.map((t) => String(t.id)) })).ids : [];
      fresh.push(...recent.filter((t) => unknown.includes(String(t.id))));
      if (recent.length < items.length || !unknown.length) break;   // older than the window, or everything already known
    }
    const receipts = [];
    for (const t of fresh) {
      const r = await lidl("/mre/api/v1/tickets/" + encodeURIComponent(t.id) + "?country=" + country + "&languageCode=" + language);
      if (!r.ok) continue;
      const d = (await r.json()).ticket || {};
      const html = d.htmlPrintedReceipt || "";
      const items = itemsOf(html, (h) => new DOMParser().parseFromString(h, "text/html"));
      receipts.push({ id: String(t.id), date: String(d.date || t.date || "").slice(0, 10), store: (d.store && d.store.name) || t.store || "", total: t.totalAmount ?? null, html, items });
      await new Promise((f) => setTimeout(f, 400));
    }
    let added = 0;
    for (let i = 0; i < receipts.length; i += 10) added += (await pantarr("receipts", { receipts: receipts.slice(i, i + 10) })).added || 0;
    memo.lastRun = Date.now(); write(memo);
    if (added || opened) say(added ? added + " ticket(s) Lidl Plus envoyé(s) à Pantarr." : "aucun nouveau ticket Lidl Plus.");
  })().catch((e) => { console.warn("[pantarr→lidl]", e); if (opened) say("erreur : " + e.message, true); });
})();
