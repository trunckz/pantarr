// ==UserScript==
// @name         Pantarr — Intermarché receipts
// @namespace    __PANTARR_API__
// @version      __VERSION__
// @description  Sends the new in-store receipts of the Intermarché account to Pantarr.
// @match        https://www.intermarche.com/*
// @run-at       document-start
// @grant        none
// @downloadURL  __PANTARR_API__/bridge/intermarche-purchases/userscript.user.js?k=__PANTARR_KEY__&h=__HOUSEHOLD__
// @updateURL    __PANTARR_API__/bridge/intermarche-purchases/userscript.user.js?k=__PANTARR_KEY__&h=__HOUSEHOLD__
// ==/UserScript==
// Intermarché in-store receipts (from the homelab script of 03/11, sent to Pantarr instead of Paperless): when the
// site calls its « consommateur » API (signed in, e.g. « Mes courses »), at most every 6 hours, the script reuses the
// headers of that call (x-oauth…), goes through the purchases (POST v2/…/transactions, nextToken), asks Pantarr which
// ones it does not have yet, downloads their receipts (not the bank card slips) and sends each PDF to Pantarr, which
// reads it (receipts of the stock). Nothing is stored here but the time of the last run.
(() => {
  if (window.__pantarrTickets) return;
  window.__pantarrTickets = true;
  const API = "__PANTARR_API__", AUTH = "Bearer __PANTARR_KEY__", HOUSEHOLD = "__HOUSEHOLD__";
  const EVERY = 6 * 3600 * 1000, LAST = "pantarrTicketsLast";
  try { if (Date.now() - Number(localStorage.getItem(LAST) || 0) < EVERY) return; } catch (e) { /* private mode */ }
  const pantarr = (path, body, type) => fetch(`${API}/bridge/intermarche-purchases/${path}${path.includes("?") ? "&" : "?"}household=${encodeURIComponent(HOUSEHOLD)}`, {
    method: "POST", headers: { Authorization: AUTH, "Content-Type": type || "application/json" }, body: type ? body : JSON.stringify(body) });
  let banner = null;
  const say = (t) => {
    if (!banner) {
      banner = document.createElement("div");
      banner.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:2147483647;padding:10px;font:14px sans-serif;text-align:center;background:#2f9e44;color:#fff;opacity:.95";
      document.body.appendChild(banner);
    }
    banner.textContent = t;
  };
  const end = (t) => { if (t) { say(t); setTimeout(() => banner && banner.remove(), 8000); } else if (banner) banner.remove(); };
  const pause = (ms) => new Promise((f) => setTimeout(f, ms));
  const run = async (h, url) => {
    try {
      const id = (url.match(/customers\/([0-9a-f-]{36})/) || [])[1];
      const B = "/api/service/consommateur/";
      const itm = (p, o) => f0(B + p, Object.assign({ headers: h, credentials: "include" }, o || {}));
      // the purchases, newest first, until a page that Pantarr already has entirely
      const purchases = []; let next = null, pages = 0;
      do {
        const body = { limit: 30 }; if (next) body.nextToken = next;
        const r = await itm("v2/customers/" + id + "/transactions", { method: "POST", headers: Object.assign({}, h, { "content-type": "application/json" }), body: JSON.stringify(body) });
        if (!r.ok) throw new Error("liste des achats : " + r.status);
        const d = await r.json();
        const page = (d.transactions || []).map((t) => ({ id: String(t.transactionId), date: String(t.date || "").slice(0, 10) }));
        const u = await pantarr("tickets/unknown", { transactions: page });
        if (!u.ok) throw new Error("Pantarr : " + u.status);
        const unknown = new Set((await u.json()).ids);
        purchases.push(...page.filter((t) => unknown.has(t.id)));
        next = d.nextToken; pages++;
        if (page.length && !page.some((t) => unknown.has(t.id))) break;
        await pause(400);
      } while (next && pages < 60);
      try { localStorage.setItem(LAST, String(Date.now())); } catch (e) { /* private mode */ }
      if (!purchases.length) { end(""); return; }
      let sent = 0, n = 0; const failed = [];
      for (const t of purchases) {
        n++;
        say("Tickets Intermarché → Pantarr : " + n + " / " + purchases.length + " — ne fermez pas cette page");
        try {
          const det = await (await itm("v1/customers/" + id + "/transactions/" + t.id)).json();
          const slips = (det.receipt || []).filter((x) => !/credit_card/i.test(x.type || ""));
          for (let i = 0; i < slips.length; i++) {
            const pdf = await (await itm("v1/customers/" + id + "/receipts/" + slips[i].receiptId)).arrayBuffer();
            const q = "tickets?transaction=" + encodeURIComponent(t.id) + "&date=" + t.date + "&n=" + i;
            const r = await pantarr(q, new Blob([pdf], { type: "application/pdf" }), "application/pdf");
            if (!r.ok) throw new Error("envoi " + r.status);
          }
          if (!slips.length) await pantarr("tickets/empty", { id: t.id });   // only the bank card slip: noted, not asked again
          sent++;
        } catch (e) { failed.push(t.date + " " + e.message); }
        await pause(500);
      }
      end(sent + " ticket(s) Intermarché envoyé(s) à Pantarr." + (failed.length ? " Échecs (" + failed.length + ") : " + failed.slice(0, 3).join(" ; ") : ""));
    } catch (e) { end("Tickets Intermarché : erreur (" + e.message + ")"); }
  };
  // the headers of the site's own call to its customer API (signed in)
  let taken = false;
  const f0 = window.fetch;
  window.fetch = function (i, o) {
    try {
      const u = typeof i === "string" ? i : i.url;
      if (!taken && /\/api\/service\/consommateur\/.*customers\/[0-9a-f-]{36}/.test(u)) {
        let h = {}; const src = (o && o.headers) || (i && i.headers);
        if (src) { if (src instanceof Headers) src.forEach((v, k) => { h[k] = v; }); else h = Object.assign({}, src); }
        if (Object.keys(h).some((k) => /x-oauth/i.test(k))) { taken = true; setTimeout(() => run(h, u), 1500); }
      }
    } catch (e) { /* never in the way of the site */ }
    return f0.apply(this, arguments);
  };
})();
