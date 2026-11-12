// ==UserScript==
// @name         Pantarr — __STORE_NAME__
// @namespace    __PANTARR_API__
// @version      __VERSION__
// @description  Fills the __STORE_NAME__ online basket with the Pantarr shopping list (learns the site's own search and add-to-basket).
// __MATCHES__
// @run-at       document-start
// @grant        none
// @downloadURL  __PANTARR_API__/bridge/__MODULE__/userscript.user.js?k=__PANTARR_KEY__
// @updateURL    __PANTARR_API__/bridge/__MODULE__/userscript.user.js?k=__PANTARR_KEY__
// ==/UserScript==
// Pantarr browser bridge for any online store (« cart » connectors without a dedicated script). It runs in the user's
// own browser, signed in on the store site, and only repeats what the site itself does when the user searches and
// adds a product: nothing is sent from a server, no protection is worked around.
// 1. It watches the site's own requests (fetch / XMLHttpRequest) to LEARN, once, how the site searches (« lait »
//    typed in the site's search box) and how it adds a product (one product added by hand). What it learns stays in
//    the site's local storage of this browser.
// 2. Opened from Pantarr (« Send to the online store », #pantarr=<household>), or with its button afterwards: the
//    online shopping list, the usual products first (★), and « Add to basket » repeating the learned request.
// 3. When the adding could not be learned: assisted mode, one « Search on the site » per item, the user adds.

/* ── Pure helpers (also loaded by the unit tests) ── */
const ID_KEYS = /^(id|sku|ean|ean13|gtin|gtin13|productid|product_id|itemid|item_id|code|reference|ref|offerid|articleid)$/i;
const NAME_KEYS = /^(name|label|libelle|title|designation|displayname|productname|product_name|libelleproduit|shortname)$/i;
const PRICE_KEYS = /^(price|prix|unitprice|pricevalue|amount|finalprice|sellprice|defaultprice|currentprice|saleprice|baseprice|regularprice)$/i;
// names, brands kept in a sub-object (Chronodrive: { labels: { productLabel, brandLabel }, prices: { defaultPrice } })
const NESTED_NAME = /^(productlabel|productname|name|label|title|shortname|designation|libelle)$/i;
const NESTED_BRAND = /^(brandlabel|brand|brandname|marque|libellemarque)$/i;
const BRAND_KEYS = /^(brand|marque|brandname|libellemarque)$/i;

/** Product-like objects found anywhere in a JSON answer (or in data embedded in a page): { id, name, brand, price }. */
function productsIn(json, max, strict) {
  const out = [], seen = new Set(), limit = max || 60, scan = 400;   // all looked at, the best kept (see the end)
  const scalar = (v) => typeof v === "string" || typeof v === "number";
  const pick = (o, re) => { for (const k of Object.keys(o)) if (re.test(k) && scalar(o[k])) return o[k]; return null; };
  const priceOf = (o, depth) => {
    const p = pick(o, PRICE_KEYS); if (p !== null) return p;
    for (const k of Object.keys(o)) if (/price|prix|pricing|tarif/i.test(k) && o[k] && typeof o[k] === "object") {
      const q = pick(o[k], /^(value|amount|price|formatted|current|final|selling)$/i); if (q !== null) return q;
      if ((depth || 0) < 2) { const r = priceOf(o[k], (depth || 0) + 1); if (r !== null) return r; }   // { pricing: { current: { value } } }
    }
    return null;
  };
  const nested = (o, re) => {   // a scalar of a sub-object holding labels or names
    for (const k of Object.keys(o)) if (o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) && /label|name|title|libelle|designation/i.test(k)) { const v = pick(o[k], re); if (v !== null) return v; }
    return null;
  };
  const brandOf = (o) => { const b = pick(o, BRAND_KEYS); if (b !== null) return b; for (const k of Object.keys(o)) if (BRAND_KEYS.test(k) && o[k] && typeof o[k] === "object") return pick(o[k], NAME_KEYS); return nested(o, NESTED_BRAND); };
  const walk = (v, depth) => {
    if (out.length >= scan || depth > 9 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    const id = pick(v, ID_KEYS), name = pick(v, NAME_KEYS) ?? nested(v, NESTED_NAME);
    // strict (data of a page, full of other blocks: « Choisi pour vous »): a price, or an EAN as identifier
    const sellable = !strict || priceOf(v) !== null || /^\d{12,14}$/.test(String(id));
    if (id !== null && name !== null && sellable && String(name).trim().length >= 3 && /[a-z]{2}/i.test(String(name)) && !/^https?:/.test(String(name))) {
      const key = String(id);
      if (!seen.has(key)) { seen.add(key); out.push({ id: key, name: String(name).trim(), brand: brandOf(v) ? String(brandOf(v)) : "", price: priceOf(v), raw: v }); }
    }
    for (const k of Object.keys(v)) if (v[k] && typeof v[k] === "object") walk(v[k], depth + 1);
  };
  walk(json, 0);
  // an answer also holds filters and blocks with an id and a name (« FRANCE », « Produits laitiers & Oeufs », « Choisi
  // pour vous »): when some objects look like products (a price, a brand or an EAN), only those are kept
  // (a product card also has many fields, a filter two or three)
  const rich = out.filter((p) => (p.price !== null && p.price !== "") || p.brand || /^\d{12,14}$/.test(p.id) || Object.keys(p.raw).length >= 8);
  return (rich.length ? rich : strict ? [] : out).slice(0, limit);
}

/** Nuxt 3 payload (« __NUXT_DATA__ », devalue format): one flat array, every value given by the index of its cell
 * (an object { name: 12 } means name = array[12]) ; turned back into plain JSON. */
function unflatten(arr) {
  const TAGS = new Set(["Reactive", "ShallowReactive", "Ref", "ShallowRef", "EmptyRef", "EmptyShallowRef", "NuxtError", "Island", "Date", "Set", "Map", "RegExp", "BigInt", "null", "Object"]);
  const done = new Map();
  const get = (i, depth) => {
    if (typeof i !== "number" || i < 0 || i >= arr.length || depth > 60) return undefined;
    if (done.has(i)) return done.get(i);
    const v = arr[i];
    if (v === null || typeof v !== "object") { done.set(i, v); return v; }
    if (Array.isArray(v)) {
      if (typeof v[0] === "string" && TAGS.has(v[0])) {
        const tag = v[0];
        const r = tag === "Date" || tag === "RegExp" || tag === "BigInt" ? v[1] : tag === "Set" ? v.slice(1).map((x) => get(x, depth + 1))
          : tag === "Map" ? v.slice(1).map((x) => get(x, depth + 1)) : tag === "EmptyRef" || tag === "EmptyShallowRef" ? null : get(v[1], depth + 1);
        done.set(i, r); return r;
      }
      const out = []; done.set(i, out);
      for (const x of v) out.push(get(x, depth + 1));
      return out;
    }
    const o = {}; done.set(i, o);
    for (const k of Object.keys(v)) o[k] = get(v[k], depth + 1);
    return o;
  };
  return get(0, 0);
}

/** JSON blocks embedded in a page (JSON-LD, Next.js, Nuxt 2 and 3, other JSON scripts). */
function jsonInPage(html) {
  const out = [];
  const re = /<script([^>]*)type=["'](application\/(?:ld\+)?json)["']([^>]*)>([\s\S]*?)<\/script>|<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const j = JSON.parse(m[4] || m[5]);
      out.push(/__NUXT_DATA__|data-nuxt-data/.test((m[1] || "") + (m[3] || "")) && Array.isArray(j) ? unflatten(j) : j);
    } catch (e) { /* not JSON */ }
  }
  const nuxt = html.match(/window\.__NUXT__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
  if (nuxt) { try { out.push(JSON.parse(nuxt[1])); } catch (e) { /* a function, not JSON */ } }
  return out;
}

/** Where a value sits in a JSON body: path of keys ; null when absent. */
function pathOf(obj, test, path) {
  path = path || [];
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== "object") return test(obj, path) ? path : null;
  for (const k of Object.keys(obj)) { const p = pathOf(obj[k], test, path.concat(k)); if (p) return p; }
  return null;
}
function setPath(obj, path, value) {
  let o = obj;
  for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
  o[path[path.length - 1]] = typeof o[path[path.length - 1]] === "number" ? Number(value) : value;
  return obj;
}

/** A request of the site turned into a template: the searched word replaced by {q}. */
function searchTemplate(call, word) {
  const w = String(word).toLowerCase(), enc = encodeURIComponent(word).toLowerCase();
  const swap = (s) => { if (!s) return s; const i = s.toLowerCase().indexOf(enc) >= 0 ? s.toLowerCase().indexOf(enc) : s.toLowerCase().indexOf(w); const len = s.toLowerCase().indexOf(enc) >= 0 ? enc.length : w.length;
    return i >= 0 ? s.slice(0, i) + "{q}" + s.slice(i + len) : s; };
  const url = swap(call.url), body = swap(call.body);
  return url.includes("{q}") || (body || "").includes("{q}") ? { kind: "json", method: call.method, url, body: body || null, contentType: call.contentType || "" } : null;
}

/** The add-to-basket request of the site turned into a template: the product id (and the quantity) located. */
function addTemplate(call, knownIds) {
  const ids = new Set(knownIds.map(String));
  const isId = (v) => ids.has(String(v));
  let json = null;
  try { json = call.body ? JSON.parse(call.body) : null; } catch (e) { json = null; }
  const t = { kind: "json", method: call.method, url: call.url, body: call.body, contentType: call.contentType || "", idPath: null, qtyPath: null, idInUrl: false };
  if (json) {
    t.idPath = pathOf(json, (v) => isId(v));
    t.qtyPath = pathOf(json, (v, p) => typeof v === "number" && /quantit|qty|quantity|nombre|count|amount/i.test(String(p[p.length - 1] || "")));
  }
  if (!t.idPath) {
    const id = [...ids].find((x) => x.length >= 3 && call.url.includes(x));
    if (id) { t.url = call.url.replace(id, "{id}"); t.idInUrl = true; }
  }
  if (!t.idPath && !t.idInUrl && call.body && !json) {   // form body
    const id = [...ids].find((x) => x.length >= 3 && call.body.includes(x));
    if (id) { t.body = call.body.replace(id, "{id}"); t.kind = "form"; t.idInUrl = true; }
  }
  return t.idPath || t.idInUrl ? t : null;
}

// Requests that are never the site's own basket: analytics, logs, ads, monitoring (New Relic, Google, Sentry…)
const NOISE = /(^|\.)(newrelic|nr-data|google|googletagmanager|doubleclick|facebook|sentry|datadoghq|hotjar|criteo|valiuz|optimalpeople|contentsquare|didomi)\.|\/(log|logs|collect|analytics|metrics|track|tracking|events?|beacon|telemetry)(\/|\?|$)|(^|\.)(metrics|analytics|log|logs|stats|tracking)\./i;
/** The store's own site (same registrable domain as the page: www.chronodrive.com and api.chronodrive.com). */
function sameSite(url, pageHost) {
  try {
    const base = (h) => h.split(".").slice(-2).join(".");
    return base(new URL(url).hostname) === base(pageHost);
  } catch (e) { return false; }
}
/** Whether a request may be the add-to-basket one: the store's own API, a basket in its address, no analytics. */
function mayBeAdd(call, pageHost) {
  return /^(POST|PUT|PATCH)$/.test(call.method) && call.status < 400 && sameSite(call.url, pageHost) && !NOISE.test(call.url)
    && /cart|panier|basket|bag|trolley|caddie|line/i.test(new URL(call.url).pathname);
}

/** The request to add one product, from the template. */
function addRequest(t, id, qty) {
  let body = t.body;
  if (t.kind === "json" && t.idPath && body) {
    const j = JSON.parse(body);
    setPath(j, t.idPath, id);
    if (t.qtyPath) setPath(j, t.qtyPath, qty);
    body = JSON.stringify(j);
  } else if (body) body = body.replace("{id}", encodeURIComponent(id));
  return { method: t.method, url: t.url.replace("{id}", encodeURIComponent(id)), body };
}

// Rank of a product for an item of the list: the item itself (its name starts with the item: « Tomates cerises » for
// « Tomate ») before a product that only contains it (« Olives farcies à la tomate »), and a transformed product
// (« séchées », « pelées au jus », « sauce »…) last when the item does not ask for it.
const TRANSFORMED = ["seche", "sechee", "concass", "coulis", "sauce", "puree", "jus", "confit", "poudre", "chips", "soupe", "veloute", "compote", "sirop", "nectar",
  "confiture", "aromatis", "saveur", "biscott", "biscuit", "gateau", "preparation", "cuisin", "plat", "pizza", "tarte", "quiche", "tartinable", "farci", "pele", "chapelure"];
const plainWords = (t) => String(t || "").replace(/œ/g, "oe").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
const stem = (w) => w.replace(/(es|s|x)$/, "");
function rankFor(item, name) {
  const A = plainWords(String(item).replace(/\(.*?\)/g, "")).filter((w) => !["frais", "fraiche", "bio", "paquet", "boite", "sachet", "barquette", "tranche"].includes(w));
  const B = plainWords(name);
  if (!A.length || !B.length) return 0;
  const asked = new Set(A.map(stem));
  const transformed = B.some((w) => !asked.has(stem(w)) && TRANSFORMED.some((t) => w.startsWith(t)));
  const head = stem(B[0]) === stem(A[0]) || stem(B[0]).startsWith(stem(A[0]));
  const all = A.every((a) => B.some((b) => stem(b) === stem(a) || stem(b).startsWith(stem(a))));
  const composed = /,/.test(name) || (B.includes("mois") && !asked.has("moi"));   // « Tomate, riz et poulet dès 6 mois »
  return (head ? 2 : all ? 1 : 0) - (transformed ? 2 : 0) - (composed ? 1 : 0);
}

/** The biggest list of « rich » objects of an answer (product cards have many fields): its path and its first element. */
function biggestList(v) {
  let best = null;
  const walk = (x, path, depth) => {
    if (!x || typeof x !== "object" || depth > 12) return;
    if (Array.isArray(x)) {
      const rich = x.filter((e) => e && typeof e === "object" && !Array.isArray(e) && Object.keys(e).length >= 5);
      if (rich.length >= 2 && (!best || rich.length > best.n)) best = { n: rich.length, path: path.join("."), first: rich[0] };
      x.slice(0, 50).forEach((e, i) => walk(e, path.concat(String(i)), depth + 1));
      return;
    }
    for (const k of Object.keys(x)) walk(x[k], path.concat(k), depth + 1);
  };
  walk(v, [], 0);
  return best && { n: best.n, path: best.path, first: outline(best.first, 2) };
}

/** Short outline of an answer for the diagnostic: its keys, the first element of each list, values cut short. */
function outline(v, depth) {
  depth = depth || 0;
  if (v === null || typeof v !== "object") return typeof v === "string" ? v.slice(0, 40) : v;
  if (depth > 4) return Array.isArray(v) ? "[…]" : "{…}";
  if (Array.isArray(v)) return v.length ? ["(" + v.length + ")", outline(v[0], depth + 1)] : [];
  const o = {};
  for (const k of Object.keys(v).slice(0, 25)) o[k] = outline(v[k], depth + 1);
  return o;
}

if (typeof module !== "undefined") module.exports = { rankFor, biggestList, outline, productsIn, jsonInPage, unflatten, searchTemplate, addTemplate, addRequest, mayBeAdd, sameSite };

/* ── In the browser ── */
if (typeof window !== "undefined" && typeof document !== "undefined") (() => {
  const STORE = __STORE_JSON__;
  const MODULE = "__MODULE__", API = "__PANTARR_API__", AUTH = { Authorization: "Bearer __PANTARR_KEY__" };
  const KEY = "pantarr:" + MODULE;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  let memo = read();   // { household, search, add, choices: { article: id } }
  // an adding learned before v4 from a third-party request (analytics, logs) is forgotten: learnt again
  if (memo.add && !sameSite(memo.add.url, location.hostname)) { delete memo.add; write(memo); }
  // a search learned on the results page before v6 is learnt again once (the site's own request is preferred now)
  if (memo.search && memo.search.kind === "page" && !memo.v6) { delete memo.search; memo.v6 = true; write(memo); }
  const opened = location.hash.match(/#pantarr=([a-z0-9]+)$/i);
  if (opened) { memo.household = opened[1]; write(memo); history.replaceState(null, "", location.pathname + location.search); }
  console.info("[pantarr→" + MODULE + "] script __VERSION__");

  // ── The site's own requests, kept a short while (to learn from them, and to reuse its current headers) ──
  const calls = [], known = new Map();
  const plain = (h) => { const x = {}; if (!h) return x; if (h instanceof Headers) h.forEach((v, k) => { x[k] = v; }); else if (Array.isArray(h)) h.forEach(([k, v]) => { x[k] = v; }); else Object.assign(x, h);
    for (const k of Object.keys(x)) if (/^(cookie|content-length|host)$/i.test(k)) delete x[k]; return x; };
  const note = (c) => {
    calls.push(c); if (calls.length > 80) calls.shift();
    // products of the store: from lists only (a search, a shelf), not a single object like the customer's own record
    if (c.json && sameSite(c.url, location.hostname)) { const ps = productsIn(c.json); if (ps.length >= 2) for (const p of ps) known.set(p.id, p); }
    watchers.forEach((w) => { try { w(c); } catch (e) { /* ignore */ } });
  };
  const watchers = new Set();
  const f0 = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || String(input);
    const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    const body = init && typeof init.body === "string" ? init.body : null;
    const headers = plain((init && init.headers) || (input && input.headers));
    const r = await f0.apply(this, arguments);
    {   // Pantarr's own calls go through f0 directly: only the site's requests reach here
      try {
        const ct = r.headers.get("content-type") || "";
        const c = { url: new URL(url, location.href).href, method, body, headers, contentType: headers["content-type"] || headers["Content-Type"] || "", status: r.status, json: null, at: Date.now() };
        if (ct.includes("json")) r.clone().json().then((j) => { c.json = j; note(c); }).catch(() => note(c)); else note(c);
      } catch (e) { /* never break the site */ }
    }
    return r;
  };
  const op = XMLHttpRequest.prototype.open, sh = XMLHttpRequest.prototype.setRequestHeader, se = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__p = { method: String(m).toUpperCase(), url: new URL(String(u), location.href).href, headers: {} }; return op.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { if (this.__p && !/^(cookie|content-length)$/i.test(k)) this.__p.headers[k] = v; return sh.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    const p = this.__p;
    if (p) {
      p.body = typeof b === "string" ? b : null;
      this.addEventListener("load", () => {
        let json = null; try { json = JSON.parse(this.responseText); } catch (e) { /* not JSON */ }
        note({ url: p.url, method: p.method, body: p.body, headers: p.headers, contentType: p.headers["Content-Type"] || p.headers["content-type"] || "", status: this.status, json, at: Date.now() });
      });
    }
    return se.apply(this, arguments);
  };

  const pause = (ms) => new Promise((f) => setTimeout(f, ms));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const plainText = (t) => String(t || "").replace(/œ/g, "oe").replace(/Œ/g, "Oe").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const words = (t) => plainText(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !["une", "les", "des", "avec", "pour", "sans", "aux"].includes(w)).map((w) => w.replace(/[sx]$/, ""));
  const article = (t) => t.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();
  const label = (p) => (p.brand && !plainText(p.name).includes(plainText(p.brand)) ? p.brand + " - " : "") + p.name + (p.price !== null && p.price !== undefined && p.price !== "" ? " — " + p.price + (/€/.test(String(p.price)) ? "" : " €") : "");
  const looksLike = (a, b) => { const A = words(a), B = words(b); return A.length > 0 && A.filter((w) => B.some((x) => x.startsWith(w) || w.startsWith(x))).length >= Math.min(A.length, 2); };
  const pantarr = (path, options) => f0(API + "/bridge/" + MODULE + "/" + path + (path.includes("?") ? "&" : "?") + "household=" + memo.household,
    Object.assign({ headers: AUTH }, options || {}));
  /** Headers of the latest request of the site to the same address (tokens renewed since the learning), else the learned ones. */
  const freshHeaders = (url, learned) => {
    const path = new URL(url.replace(/\{q\}|\{id\}/g, "x"), location.href).pathname.split("/").slice(0, 3).join("/");
    for (let i = calls.length - 1; i >= 0; i--) if (new URL(calls[i].url).pathname.startsWith(path) && Object.keys(calls[i].headers).length) return calls[i].headers;
    return learned || {};
  };
  const own = (url, init) => f0(url, Object.assign({ credentials: "include" }, init));

  // ── Search: learned request, else the search page of the site (data embedded in the page) ──
  const pageUrl = (q) => (memo.search && memo.search.kind === "page" ? memo.search.url : STORE.searchPage).replace("{q}", encodeURIComponent(q));
  async function search(q) {
    const s = memo.search;
    if (s && s.kind === "json") {
      const url = s.url.replace("{q}", encodeURIComponent(q)), headers = Object.assign({}, freshHeaders(s.url, s.headers));
      if (s.contentType) headers["content-type"] = s.contentType;
      const r = await own(url, { method: s.method, headers, body: s.body ? s.body.replace("{q}", q) : undefined });
      if (!r.ok) throw new Error("recherche " + r.status);
      lastAnswer = await r.json();
      return productsIn(lastAnswer, 15);
    }
    const r = await own(pageUrl(q), { headers: { accept: "text/html" } });
    if (!r.ok) throw new Error("recherche " + r.status);
    const blocks = jsonInPage(await r.text());
    lastAnswer = blocks;   // diagnostic: what the page holds
    const found = []; for (const j of blocks) found.push(...productsIn(j, 15, true));
    return found.filter((p, i) => found.findIndex((x) => x.id === p.id) === i).slice(0, 15);
  }
  async function add(id, qty) {
    const t = memo.add, req = addRequest(t, id, qty);
    const headers = Object.assign({}, freshHeaders(t.url, t.headers));
    if (t.contentType) headers["content-type"] = t.contentType;
    const r = await own(req.url, { method: req.method, headers, body: req.body || undefined });
    if (!r.ok) throw new Error(String(r.status));
  }

  // ── Learning: wait for the user's own search, then for one product added by hand ──
  function learnSearch(word, done) {
    const w = (c) => {
      if (!c.json || productsIn(c.json).length < 2) return;
      const t = searchTemplate(c, word);
      if (t) { watchers.delete(w); clearInterval(timer); memo.search = Object.assign(t, { headers: c.headers }); write(memo); done(true); }
    };
    watchers.add(w);
    // or a results page whose address holds the word, if no request of the site has given the products after a while
    // (the request is better: a page is full of other blocks)
    let seenAt = 0;
    const timer = setInterval(() => {
      if (plainText(decodeURIComponent(location.href)).includes(plainText(word)) && (seenAt = seenAt || Date.now()) && Date.now() - seenAt >= 6000) {
        const url = location.href.replace(new RegExp(encodeURIComponent(word) + "|" + word, "i"), "{q}");
        if (url.includes("{q}")) { watchers.delete(w); clearInterval(timer); memo.search = { kind: "page", url }; write(memo); done(true); }
      }
    }, 1000);
  }
  function learnAdd(done) {
    const w = (c) => {
      if (!mayBeAdd(c, location.hostname)) return;
      const t = addTemplate(c, [...known.keys()]);
      if (t) { watchers.delete(w); memo.add = Object.assign(t, { headers: c.headers }); write(memo); done(true); }
    };
    watchers.add(w);
  }

  // ── Panel ──
  let frame = null;
  const state = (t) => { const e = frame && frame.querySelector("#pt-state"); if (e) e.textContent = t; };
  const button = (id, text, main) => '<button id="' + id + '" style="background:' + (main ? "#2f6f4f;color:#fff" : "#eee;color:#111") + ';border:0;border-radius:8px;padding:8px 12px;font:inherit;cursor:pointer;margin:4px 6px 0 0">' + text + "</button>";
  let lastAnswer = null;   // the last answer of the learned search (diagnostic)
  function diagnostic() {
    const d = { store: MODULE, version: "__VERSION__", page: location.origin + location.pathname, search: memo.search ? { kind: memo.search.kind, method: memo.search.method, url: memo.search.url } : null,
      add: memo.add ? { method: memo.add.method, url: memo.add.url, idPath: memo.add.idPath, qtyPath: memo.add.qtyPath, idInUrl: memo.add.idInUrl } : null,
      calls: calls.slice(-25).map((c) => c.method + " " + c.status + " " + c.url.replace(/[?#].*$/, "") + (c.json ? " (json, " + productsIn(c.json).length + " produits)" : "")),
      // what the learned search answered last (outline), and what was taken from it
      answer: lastAnswer ? JSON.stringify(outline(lastAnswer)).slice(0, 1500) : null,
      cards: lastAnswer ? biggestList(lastAnswer) : null,
      taken: lastAnswer ? productsIn(lastAnswer, 5).map((p) => p.id + " | " + p.name + " | " + p.price) : null };
    return JSON.stringify(d, null, 1);
  }
  async function openPanel() {
    if (document.readyState !== "complete") await new Promise((f) => window.addEventListener("load", f, { once: true }));
    await pause(1000);
    if (frame) frame.remove();
    frame = document.createElement("div");
    frame.style.cssText = "position:fixed;bottom:0;left:0;right:0;max-height:45vh;overflow:auto;overflow-x:hidden;z-index:2147483647;background:#fff;color:#111;font:14px sans-serif;border-top:4px solid #2f6f4f;padding:10px 14px;box-shadow:0 -4px 16px rgba(0,0,0,.2)";
    frame.innerHTML = '<div style="display:flex;gap:8px;align-items:baseline"><b>Pantarr → ' + esc(STORE.name) + '</b> <span id="pt-state" style="flex:1"></span>'
      + '<button id="pt-mini" title="Réduire / agrandir" style="border:0;background:#eee;border-radius:6px;cursor:pointer">▾</button></div><div id="pt-body"></div><div id="pt-foot"></div>';
    frame.querySelector("#pt-mini").onclick = () => {   // folded to its title bar, to see the site under it
      const folded = frame.dataset.folded !== "1";
      frame.dataset.folded = folded ? "1" : "";
      for (const id of ["#pt-body", "#pt-foot"]) frame.querySelector(id).style.display = folded ? "none" : "";
      frame.querySelector("#pt-mini").textContent = folded ? "▴" : "▾";
    };
    document.body.appendChild(frame);
    const keep = setInterval(() => { if (!frame.isConnected && !frame.dataset.closed) document.body.appendChild(frame); }, 1000);
    const foot = frame.querySelector("#pt-foot"), body = frame.querySelector("#pt-body");
    foot.innerHTML = button("pt-diag", "Diagnostic") + button("pt-forget", "Réapprendre") + button("pt-close", "Fermer");
    frame.querySelector("#pt-close").onclick = () => { frame.dataset.closed = "1"; clearInterval(keep); frame.remove(); };
    frame.querySelector("#pt-forget").onclick = () => { delete memo.search; delete memo.add; write(memo); openPanel(); };
    frame.querySelector("#pt-diag").onclick = async () => {
      const text = diagnostic();
      try { await navigator.clipboard.writeText(text); state("Diagnostic copié : collez-le à Pantarr (ou à la personne qui vous aide)."); } catch (e) { body.insertAdjacentHTML("beforeend", "<pre style='white-space:pre-wrap;font-size:11px'>" + esc(text) + "</pre>"); }
    };
    if (!memo.household) { state("Ouvrez ce site depuis Pantarr (Courses → … → Envoyer) une première fois."); return; }

    // 1. Search: the search page of the site may work as is; otherwise learn the user's own search
    if (!memo.search) {
      state("Vérification de la recherche du site…");
      let ok = false; try { ok = (await search("lait")).length > 0; } catch (e) { ok = false; }
      if (ok) { memo.search = { kind: "page", url: STORE.searchPage }; write(memo); }
      else {
        body.innerHTML = "<p><b>Étape 1 (une seule fois)</b> : tapez <b>lait</b> dans la barre de recherche du site et lancez la recherche. Pantarr regarde comment le site cherche.</p>";
        state("En attente de votre recherche…");
        await new Promise((f) => learnSearch("lait", f));
        console.info("[pantarr→" + MODULE + "] recherche apprise", memo.search.kind, memo.search.url);
      }
    }
    // 2. Adding: learn it from one product added by hand (or go on in assisted mode)
    if (!memo.add && !memo.assisted) {
      body.innerHTML = "<p><b>Étape 2 (une seule fois)</b> : ajoutez <b>un produit au panier à la main</b>, n'importe lequel (vous pourrez le retirer). Pantarr regarde comment le site l'ajoute.</p>" + button("pt-skip", "Je préfère ajouter moi-même chaque produit");
      state("En attente d'un ajout au panier…");
      const choice = await new Promise((f) => { learnAdd(() => f("learned")); frame.querySelector("#pt-skip").onclick = () => f("assisted"); });
      if (choice === "assisted") { memo.assisted = true; write(memo); }
      console.info("[pantarr→" + MODULE + "] ajout", choice, memo.add && memo.add.url);
    }
    await fill(body);
  }

  async function fill(body) {
    let items = [], usual = [];
    let brands = { like: [], ban: [] };   // household's preferred and banned brands (Settings → Shopping)
    try { const answer = await (await pantarr("cart")).json(); items = answer.items || []; brands = Object.assign(brands, answer.brands || {}); } catch (e) { state("Pantarr injoignable : " + e.message); return; }
    const ofBrand = (p, list) => (list || []).some((b) => b && plainText(p.brand + " " + p.name).includes(plainText(b).trim()));
    try { usual = await (await pantarr("products")).json(); } catch (e) { usual = []; }
    if (!items.length) { body.innerHTML = "<p>La liste « Au drive » de Pantarr est vide.</p>"; state(""); return; }
    const assisted = !memo.add;
    body.innerHTML = "";
    // v12 : one line per item, one tab per aisle (only one aisle on the screen at a time)
    const sections = new Map();
    const tabs = document.createElement("div");
    tabs.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;margin:6px 0";
    body.appendChild(tabs);
    if (new Set(items.map((a) => a.a || "Autres")).size < 2) tabs.style.display = "none";
    const show = (sec) => {
      for (const x of sections.values()) { x.d.style.display = "none"; x.b.style.background = "#eee"; x.b.style.color = "#111"; }
      sec.d.style.display = "block"; sec.b.style.background = "#2f6f4f"; sec.b.style.color = "#fff";
    };
    const sectionOf = (aisle) => {
      if (!sections.has(aisle)) {
        const d = document.createElement("div"), b = document.createElement("button");
        b.style.cssText = "border:0;border-radius:14px;padding:4px 10px;font:inherit;font-size:12px;cursor:pointer";
        tabs.appendChild(b); body.appendChild(d);
        const sec = { d, b, n: 0, title: aisle };
        b.onclick = () => show(sec);
        sections.set(aisle, sec);
        if (sections.size === 1) show(sec); else { d.style.display = "none"; b.style.background = "#eee"; }
      }
      return sections.get(aisle);
    };
    const lines = [...items].sort((x, y) => (x.a || "~").localeCompare(y.a || "~")).map((a) => {
      const sec = sectionOf(a.a || "Autres");
      sec.n++; sec.b.textContent = sec.title + " (" + sec.n + ")";
      const l = document.createElement("div");
      l.style.cssText = "display:flex;gap:6px;align-items:center;margin:2px 0;font-size:13px";
      l.innerHTML = '<input type="checkbox" checked><span title="' + esc(a.t) + '" style="flex:0 0 32%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(a.t) + "</span>"
        + (assisted ? '<a target="_blank" rel="noopener" href="' + esc(pageUrl(a.r || article(a.t))) + '" style="flex:1 1 auto">Chercher sur le site ↗</a>'
          : '<select style="flex:1 1 auto;min-width:0;width:0;font-size:12px"><option>recherche…</option></select><input type="number" min="1" max="20" value="' + (a.q || 1) + '" style="width:3.2em">');
      sec.d.appendChild(l);
      return { a, l, products: [], changed: false };
    });
    if (assisted) { state(items.length + " article(s) : ouvrez chaque recherche et ajoutez le produit. « Réapprendre » pour essayer l'ajout automatique."); return; }
    const go = document.createElement("p"); go.innerHTML = button("pt-add", "Ajouter au panier", true); body.appendChild(go);
    let busy = true;
    lines.forEach((x) => x.l.querySelector("select").addEventListener("change", () => { x.changed = true; }));
    frame.querySelector("#pt-add").onclick = async () => {
      if (busy) { state("Patientez : recherche des produits en cours…"); return; }
      const chosen = lines.filter((x) => x.l.querySelector("input").checked && x.products.length);
      let ok = 0; const failed = [], bought = [];
      for (const x of chosen) {
        const sel = x.l.querySelector("select"), id = sel.value, q = Math.max(1, Number(x.l.querySelector("input[type=number]").value) || 1);
        state("Ajout " + (ok + failed.length + 1) + " / " + chosen.length + "…");
        try {
          await add(id, q); ok++;
          const p = x.products.find((y) => y.id === id);
          if (p) bought.push({ name: (p.brand && !plainText(p.name).includes(plainText(p.brand)) ? p.brand + " - " : "") + p.name, quantity: q, price: typeof p.price === "number" ? p.price : null });
          if (x.changed) {
            memo.choices = Object.assign(memo.choices || {}, { [plainText(article(x.a.t))]: id }); write(memo);
            const name = (sel.selectedOptions[0] && sel.selectedOptions[0].textContent || "").replace(/^★ /, "").replace(/ —.*$/, "");
            pantarr("choice", { method: "POST", headers: Object.assign({ "content-type": "application/json" }, AUTH), body: JSON.stringify({ article: x.a.t, product: name }) }).catch(() => {});
          }
        } catch (e) { failed.push(x.a.t + " (" + e.message + ")"); }
        await pause(500);
      }
      // Purchase history in Pantarr: what was just added to the basket counts as bought today
      if (bought.length) pantarr("order", { method: "POST", headers: Object.assign({ "content-type": "application/json" }, AUTH), body: JSON.stringify({ items: bought }) }).catch(() => {});
      state(ok + " article(s) ajouté(s)" + (failed.length ? ", échecs : " + failed.join(" ; ") + " — « Réapprendre » si cela continue" : "") + ". Rechargez la page pour voir le panier, puis choisissez le créneau.");
    };
    // v11 : 3 items searched at once, each search done once
    const cache = new Map();
    const find = (q) => { const k = plainText(q).trim(); if (!cache.has(k)) cache.set(k, search(q).catch((e) => { cache.delete(k); throw e; })); return cache.get(k); };
    const prepare = async (x) => {
      const sel = x.l.querySelector("select"), mine = (memo.choices || {})[plainText(article(x.a.t))];
      try {
        const star = new Set(), seen = new Set();
        const push = (p, starred) => { if (!seen.has(p.id) && x.products.length < 12 && !ofBrand(p, brands.ban)) { seen.add(p.id); x.products.push(p); if (starred) star.add(p.id); } };
        const bought = usual.filter((u) => looksLike(article(x.a.t), u.l)).slice(0, 2);
        const [pref, general, ...ofBought] = await Promise.all([x.a.r ? find(x.a.r).catch(() => []) : [], find(article(x.a.t)),
          ...bought.map((u) => find(u.l.replace(/,.*$/, "")).catch(() => []))]);
        for (const p of pref) if (looksLike(x.a.r, p.name + " " + p.brand)) push(p, true);
        for (const [i, u] of bought.entries()) for (const p of ofBought[i].slice(0, 5)) if (looksLike(u.l, p.brand + " " + p.name)) { push(p, true); break; }
        // the site's results, the item itself first (« Tomate » : tomatoes, not olives stuffed with tomato)
        general.map((p, i) => { const r = rankFor(article(x.a.t), p.name); return { p, i, r: r + (r > 0 && ofBrand(p, brands.like) ? 1.5 : 0) }; })
          .sort((a, b) => b.r - a.r || a.i - b.i).forEach(({ p }) => push(p, false));
        if (!x.products.length) { sel.innerHTML = "<option>aucun produit trouvé</option>"; x.l.querySelector("input").checked = false; return; }
        sel.innerHTML = x.products.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === mine ? " selected" : "") + ">" + (star.has(p.id) ? "★ " : "") + esc(label(p)) + "</option>").join("");
      } catch (e) { sel.innerHTML = "<option>erreur de recherche</option>"; x.l.querySelector("input").checked = false; console.warn("[pantarr→" + MODULE + "]", e); }
    };
    const queue = [...lines];
    let done = 0;
    state("Recherche des produits : 0 / " + lines.length + "…");
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (queue.length) { await prepare(queue.shift()); state("Recherche des produits : " + (++done) + " / " + lines.length + "…"); }
    }));
    busy = false;
    state(items.length + " article(s) : vérifiez les produits et les quantités, puis « Ajouter au panier ».");
  }

  // Opened from Pantarr: the panel ; afterwards, a small button brings it back on this site
  const start = () => {
    if (opened) { openPanel(); return; }
    if (!memo.household) return;
    const b = document.createElement("button");
    b.textContent = "Pantarr";
    b.title = "Remplir le panier avec la liste de courses";
    b.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483646;background:#2f6f4f;color:#fff;border:0;border-radius:20px;padding:8px 14px;font:13px sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)";
    b.onclick = () => { b.remove(); openPanel(); };
    document.body.appendChild(b);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
