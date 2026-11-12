// ==UserScript==
// @name         Pantarr — Intermarché
// @namespace    __PANTARR_API__
// @version      __VERSION__
// @description  Fills the Intermarché online basket with the Pantarr shopping list (usual products first).
// @match        https://www.intermarche.com/*
// @run-at       document-start
// @grant        none
// @downloadURL  __PANTARR_API__/bridge/intermarche-cart/userscript.user.js?k=__PANTARR_KEY__
// @updateURL    __PANTARR_API__/bridge/intermarche-cart/userscript.user.js?k=__PANTARR_KEY__
// ==/UserScript==
// Pantarr browser bridge for Intermarché (store-specific part of the « cart » connector): runs in the user's own
// browser on the store site, with the site's own session (the site is protected against bots: nothing is done from a
// server). Reuses the headers of the site's own API calls, searches the store catalogue, proposes the usual products
// first (★, checked against the purchase history), and adds the chosen quantities to the basket. Slot and payment
// stay manual.
/* ── Matching of a list item with the products bought before (also loaded by the unit tests) ── */
const sansAccent = (t) => String(t || "").replace(/œ/g, "oe").replace(/Œ/g, "Oe").replace(/æ/g, "ae").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const racine = (w) => w.replace(/[sx]$/, "");
const SIX_MOIS = new Date(Date.now() - 183 * 864e5).toISOString().slice(0, 10);
const recent = (p) => ((p.d || "") >= SIX_MOIS ? 1 : 0);
// v15/v16 : abréviations des tickets développées (« S.HACHE » → steak haché, « CCHES » → couches, « MINER. » → minérale),
// mots de l'article sans « surgelé, bio, frais… », « hamburger » = « burger » ; score : tous les mots trouvés et le
// type du produit qui commence par le premier mot (3) > premier mot en tête seulement (2) ; un mot trouvé ailleurs dans le
// nom ne suffit plus (v16) ; à score égal, la marque la plus achetée, récente, fréquente.
const ABREGES = [[/\bs hache/g, "steak hache"], [/\bcches?\b/g, "couches"], [/\bminer\b/g, "minerale"], [/\bdx\b/g, "doux"], [/\bpt\b/g, "petit"], [/\bspe\b/g, "special"]];
const etendre = (t) => { let x = sansAccent(t).split(/[^a-z0-9]+/).join(" "); for (const [a, b] of ABREGES) x = x.replace(a, b); return x; };
const DESCRIPTIFS = new Set(["surgele", "surgel", "frai", "fraiche", "bio", "maison", "nature", "piece", "paquet", "sachet", "barquette", "tranche"]);
const SYNONYMES = { hamburger: "burger", steack: "steak" };
const motsArticle = (k) => sansAccent(k.replace(/\(.*?\)/g, "")).split(/[^a-z0-9]+/).filter((w) => w.length > 2)
  .map((w) => racine(SYNONYMES[w] || w)).filter((w, i, all) => !DESCRIPTIFS.has(w) || (w === "fraiche" && all[i - 1] === "creme"));   // « crème fraîche » is a product
// v16 : type du produit = les premiers mots juste après la marque (« Marque - Type … - Variante ») ; ni le dernier segment
// (« … - Forever »), ni ce qui suit une virgule (« pizza regina, mozzarella jambon »), ni la marque (« Brioche Pasquier »)
const LIAISONS = new Set(["a", "au", "aux", "saveur", "sauce", "facon", "avec", "goût", "gout", "parfum", "en"]);
/** Type of a product: its first words after the brand, up to a linking word (« Poireaux à la crème » is leeks,
 * « Croûtons saveur ail » croutons) ; « composed » when there was one (« Crème aux œufs » is not « crème fraîche »). */
const typeDe = (p) => {
  const parts = p.l.split(" - ");
  const segment = parts.length > 1 ? parts[1] : null;
  if (!segment) return { words: etendre(p.l).split(" ").slice(0, 3).map(racine), composed: false };
  const mots = etendre(segment.split(",")[0]).split(" ");
  const fin = mots.findIndex((w, i) => i > 0 && LIAISONS.has(w));
  return { words: (fin > 0 ? mots.slice(0, fin) : mots).filter((w) => w.length > 2).slice(0, 2).map(racine), composed: fin > 0 };
};
const tete = (p) => typeDe(p).words;
const habituelsDe = (habituels, k) => {
  const mots = motsArticle(k);
  if (!mots.length) return [];
  const res = [], marques = {};
  for (const p of habituels) {
    const toks = new Set(etendre(p.l).split(" ").map(racine));
    const type = typeDe(p), vus = mots.filter((w) => toks.has(w)).length, enTete = type.words.includes(mots[0]);
    // v16 : l'article doit être le type du produit (« persil » n'est pas « Persil - Lessive », « ail » pas « Croûtons saveur
    // ail ») ; un produit composé (« … aux … ») doit avoir tous les mots de l'article
    const score = !enTete ? 0 : vus === mots.length ? 3 : (!type.composed && mots.length >= 2 && vus >= 1 ? 2 : 0);
    if (!score) continue;
    const marque = etendre(p.l).split(" ")[0];
    marques[marque] = (marques[marque] || 0) + p.n;
    res.push({ p, score, marque });
  }
  return res.sort((a, b) => (b.score - a.score) || (marques[b.marque] - marques[a.marque]) || (recent(b.p) - recent(a.p)) || (b.p.n - a.p.n))
    .slice(0, 3).map((x) => x.p);
};

// v17 : transformed products are not the raw item (« Tomate » is not « Tomates concassées », « Citron » not « Jus de citron »)
const TRANSFORMES = ["concass", "coulis", "sauce", "puree", "jus", "seche", "confit", "poudre", "chips", "soupe", "veloute", "compote", "sirop", "nectar",
  "confiture", "aromatis", "saveur", "biscott", "biscuit", "gateau", "preparation", "cuisin", "plat", "pizza", "tarte", "quiche", "salade", "chapelure"];
/** Whether a product of the site (« Marque - Nom … ») is the item of the list: the item is its type (first words
 * after the brand), not only a word of its name, and it is not a transformed product the item does not ask for. */
const estLArticle = (k, nom) => {
  const mots = motsArticle(k);
  if (!mots.length) return true;
  const t = typeDe({ l: nom });
  if (!t.words.includes(mots[0])) return false;
  const tous = new Set(etendre(nom).split(" ").map(racine));
  if (t.composed && !mots.every((w) => tous.has(w))) return false;
  const voulus = new Set(mots);
  const segment = nom.split(" - ")[1] || nom;
  return !etendre(segment.split(",")[0]).split(" ").some((w) => !voulus.has(racine(w)) && TRANSFORMES.some((t) => w.startsWith(t)));
};
/** Order of the results of a search: the item itself first, then a product of that type, then the rest (site order). */
const rangDe = (k, nom) => (estLArticle(k, nom) ? 2 : typeDe({ l: nom }).words.includes(motsArticle(k)[0]) ? 1 : 0);

// v18 : the store's shelves, learned from what goes in the basket (Intermarché gives their numbers, not their names):
// the « univers » of each aisle of Pantarr (Fruits et légumes → 2215…) and the exact shelf of each item
const nouveauxRayons = () => ({ univers: {}, rayon: {} });
const placeDe = (p) => ({ u: String((p && p.idUnivers) || ""), r: String((p && p.idRayon) || "") });
/** What was put in the basket for an item of this aisle teaches where it is. */
function apprendreRayon(m, aisle, cle, p) {
  const { u, r } = placeDe(p);
  if (aisle && u) { m.univers[aisle] = m.univers[aisle] || {}; m.univers[aisle][u] = (m.univers[aisle][u] || 0) + 1; }
  if (cle && r) m.rayon[cle] = r;
}
/** The univers of an aisle once seen twice. */
function universDe(m, aisle) {
  const c = aisle && m.univers[aisle];
  if (!c) return null;
  const [u, n] = Object.entries(c).sort((a, b) => b[1] - a[1])[0] || [];
  return n >= 2 ? u : null;
}
/** A brand of the list in the product's name (« Herta » in « Herta - Lardons fumés »). */
const deMarque = (nom, liste) => (liste || []).some((b) => b && sansAccent(nom).includes(sansAccent(b).trim()));
/** Results of a search in the best order: the item itself, in its shelf, in the univers of its aisle, of a preferred
 * brand ; then the rest ; never a banned brand. */
function classer(resultats, k, aisle, m, nomDe, marques) {
  marques = marques || {};
  resultats = resultats.filter((p) => !deMarque(nomDe(p), marques.ban));
  const attendu = universDe(m, aisle), rayon = m.rayon[motCleArticle(k)];
  const rangs = resultats.map((p, i) => ({ p, i, a: rangDe(k, nomDe(p)) }));
  const rayonsArticle = new Set(rangs.filter((x) => x.a === 2).map((x) => placeDe(x.p).r).filter(Boolean));
  for (const x of rangs) {
    const { u, r } = placeDe(x.p);
    x.score = x.a * 10 + (rayon && r === rayon ? 5 : 0) + (rayonsArticle.has(r) ? 2 : 0) + (attendu && u ? (u === attendu ? 3 : -6) : 0)
      + (x.a > 0 && deMarque(nomDe(x.p), marques.like) ? 4 : 0);
  }
  return rangs.sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.p);
}
const motCleArticle = (t) => String(t || "").replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim().toLowerCase();

if (typeof module !== "undefined") module.exports = { deMarque, habituelsDe, motsArticle, tete, estLArticle, rangDe, classer, apprendreRayon, universDe, nouveauxRayons };

if (typeof window !== "undefined" && typeof document !== "undefined") (() => {
  // Opened by Pantarr (« Send to the online store »): #pantarr=<household>. The list and the usual products come from
  // the Pantarr API with the bridge key of the user (CORS allowed for this store's site only).
  const m = location.hash.match(/#pantarr=([a-z0-9]+)$/i);
  if (!m) return;
  const household = m[1], API = "__PANTARR_API__", AUTH = { Authorization: "Bearer __PANTARR_KEY__" };
  // the site may wrap window.fetch again after this script: its own original fetch is kept here (f0, below)
  const pantarr = (path, options) => f0.call(window, API + "/bridge/intermarche-cart/" + path + (path.includes("?") ? "&" : "?") + "household=" + household,
    Object.assign({ headers: AUTH }, options || {}));
  let liste = [];
  console.info("[pantarr→drive] script __VERSION__");
  history.replaceState(null, "", location.pathname + location.search);
  let h = null, panier = null, magasin = null;
  const noter = (u, src) => {
    if (!/\/api\/service\//.test(u)) return;
    const c = u.match(/cart\/v2\/carts\/([0-9a-f-]{36})/); if (c) panier = c[1];
    const s = u.match(/pdvs\/(\d+)\//) || u.match(/storeId=(\d+)/); if (s) magasin = s[1];
    if (!h && src) {
      let x = {}; if (src instanceof Headers) src.forEach((v, k) => { x[k] = v; }); else x = Object.assign({}, src);
      if (Object.keys(x).some((k) => /x-oauth/i.test(k))) h = x;
    }
  };
  const f0 = window.fetch;
  window.fetch = function (i, o) {
    try { noter(typeof i === "string" ? i : i.url, (o && o.headers) || (i && i.headers)); } catch (e) {}
    return f0.apply(this, arguments);
  };
  window.fetch.__orig = f0;
  const op = XMLHttpRequest.prototype.open, sh = XMLHttpRequest.prototype.setRequestHeader, se = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (mt, u) { this.__u = String(u); this.__h = {}; return op.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { this.__h[k] = v; return sh.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () { try { noter(this.__u, this.__h); } catch (e) {} return se.apply(this, arguments); };
  const pause = (ms) => new Promise((f) => setTimeout(f, ms));
  const horodatage = () => {
    const d = new Date(), o = -d.getTimezoneOffset(), p = (n) => String(Math.floor(Math.abs(n))).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) + (o >= 0 ? "+" : "-") + p(o / 60) + ":" + p(o % 60);
  };
  const champ = (p, re) => { for (const [k, v] of Object.entries(p || {})) if (re.test(k) && (typeof v === "string" || typeof v === "number")) return v; return ""; };
  const nomSeul = (p) => champ(p, /^(libelle|libelleProduit|label|nom|name|title|designation)$/i) || champ(p, /libell|label|title|designation/i) || p.produitEan13 || p.itemId;
  // La marque est souvent à part dans les résultats du site : jointe au nom (affichage et comparaison)
  const nomProduit = (p) => {
    const nom = String(nomSeul(p)), marque = String(champ(p, /^(marque|brand|libelleMarque|marqueLibelle)$/i) || champ(p, /marque|brand/i) || "");
    return marque && !sansAccent(nom).includes(sansAccent(marque)) ? marque + " - " + nom : nom;
  };
  const prixProduit = (p) => { const v = champ(p, /^(prix|price|prixUnitaire|pvi)$/i) || champ(p, /prix|price/i); return v ? " — " + v + " €" : ""; };
  const echap = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  // Un résultat de recherche n'est marqué ★ que s'il ressemble au produit acheté : même marque et au moins un autre mot
  // (les libellés de caisse sont abrégés : « PAMPERS BD CCHES GEA » ; début de mot accepté dans les deux sens)
  const VIDES = new Set(["une", "marque", "intermarche", "les", "des", "avec", "pour", "sans", "aux", "the"]);
  const motsDe = (t) => sansAccent(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !VIDES.has(w));
  const pareil = (a, b) => a.startsWith(b) || b.startsWith(a);
  const correspond = (libelle, nom) => {
    const A = motsDe(etendre(libelle)), B = motsDe(nom);
    if (!A.length) return false;
    const vus = (mots) => mots.filter((a) => B.some((w) => pareil(w, a))).length;
    if (B.some((w) => pareil(w, A[0]))) return vus(A) >= Math.min(A.length, Math.max(2, Math.ceil(A.length * 0.4)));
    // Marque absente du résultat (champ à part ou non fourni) : la plupart des autres mots doivent y être
    const autres = A.slice(1);
    return autres.length >= 3 && vus(autres) >= Math.max(3, Math.ceil(autres.length * 0.6));
  };
  const motHabituel = (p) => sansAccent(p.l.replace(/, une marque intermarch[ée]/i, "")).replace(/,.*$/, "").replace(/ - /, " ").replace(/\s+/g, " ").trim();
  const motCle = (t) => t.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  // Produit choisi À LA MAIN pour un article (liste changée par l'utilisateur), proposé en premier la fois suivante.
  // v14 : clé « repasChoix2: » (les choix enregistrés avant étaient ceux proposés par défaut, parfois faux) ; anciens effacés.
  try { Object.keys(localStorage).filter((k) => k.startsWith("repasChoix:")).forEach((k) => localStorage.removeItem(k)); } catch (e) {}
  // shelves learned on this site (see classer)
  const CLE_RAYONS = "pantarr:intermarche:rayons";
  let rayons = nouveauxRayons();
  try { rayons = Object.assign(nouveauxRayons(), JSON.parse(localStorage.getItem(CLE_RAYONS) || "{}")); } catch (e) { /* none yet */ }
  const choixConnu = (k) => { try { return localStorage.getItem("repasChoix2:" + k); } catch (e) { return null; } };
  const retenir = (k, id, article, nom) => {
    try { localStorage.setItem("repasChoix2:" + k, id); } catch (e) {}
    // remembered by Pantarr too (all devices, and proposed first next time as a preferred product)
    pantarr("choice", { method: "POST", headers: Object.assign({ "content-type": "application/json" }, AUTH), body: JSON.stringify({ article, product: nom }) }).catch(() => {});
  };
  // Identifiant du panier : vu dans un appel du site, sinon cherché dans le stockage du site (clé « cart »/« panier »)
  const panierStocke = () => {
    for (const st of [localStorage, sessionStorage]) {
      try {
        for (let i = 0; i < st.length; i++) {
          const k = st.key(i);
          if (!/cart|panier|basket/i.test(k)) continue;
          const v = st.getItem(k) || "", u = v.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
          if (u) { console.info("[pantarr→drive] panier trouvé dans le stockage du site (" + k + ")"); return u[0]; }
        }
      } catch (e) {}
    }
    return null;
  };
  const lancer = async () => {
    // Le site reconstruit la page au chargement : cadre ajouté après le chargement complet, remis s'il est retiré
    if (document.readyState !== "complete") await new Promise((f) => window.addEventListener("load", f, { once: true }));
    await pause(1500);
    const cadre = document.createElement("div");
    setInterval(() => { if (!cadre.isConnected && !cadre.dataset.ferme) document.body.appendChild(cadre); }, 1000);
    cadre.style.cssText = "position:fixed;bottom:0;left:0;right:0;max-height:45vh;overflow:auto;overflow-x:hidden;z-index:2147483647;background:#fff;color:#111;font:14px sans-serif;border-top:4px solid #2f6f4f;padding:10px 14px;box-shadow:0 -4px 16px rgba(0,0,0,.2)";
    document.body.appendChild(cadre);
    const etat = (t) => { cadre.querySelector("#rp-etat").textContent = t; };
    cadre.innerHTML = '<div style="display:flex;gap:8px;align-items:baseline"><b>Pantarr → panier du drive</b> <span id="rp-etat" style="flex:1">Recherche de ta session Intermarché…</span>'
      + '<button id="rp-mini" title="Réduire / agrandir" style="border:0;background:#eee;border-radius:6px;cursor:pointer">▾</button></div><div id="rp-liste"></div>';
    // folded to its title bar, to see the site under it
    cadre.querySelector("#rp-mini").onclick = () => {
      const plie = cadre.dataset.plie !== "1";
      cadre.dataset.plie = plie ? "1" : "";
      for (const e of cadre.children) if (e !== cadre.firstElementChild) e.style.display = plie ? "none" : "";
      cadre.querySelector("#rp-mini").textContent = plie ? "▴" : "▾";
    };
    for (let n = 0; n < 60 && !(h && magasin); n++) await pause(500);
    console.info("[pantarr→drive] session : en-têtes " + (h ? "trouvés" : "absents") + ", magasin " + magasin + ", panier " + (panier ? "trouvé" : "pas encore vu"));
    if (!h || !magasin) { etat("Session introuvable : connecte-toi et choisis ton magasin drive, puis relance « Envoyer au drive » depuis la page repas."); return; }
    let marques = { like: [], ban: [] };   // household's preferred and banned brands (Settings → Shopping)
    try { const rep = await (await pantarr("cart")).json(); liste = rep.items || []; marques = Object.assign(marques, rep.brands || {}); } catch (e) { etat("Pantarr injoignable : " + e.message); return; }
    let habituels = [];
    try { habituels = await (await pantarr("products")).json(); } catch (e) { console.warn("[pantarr→drive] produits habituels indisponibles", e); }
    console.info("[pantarr→drive] " + habituels.length + " produits habituels");
    const zone = cadre.querySelector("#rp-liste");
    const lignes = [];
    // v20 : one line per item, one tab per aisle (only one aisle on the screen at a time)
    const sections = new Map();
    const barre = document.createElement("div");
    barre.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;margin:6px 0";
    zone.appendChild(barre);
    const montrer = (sec) => {
      for (const x of sections.values()) { x.d.style.display = "none"; x.b.style.background = "#eee"; x.b.style.color = "#111"; }
      sec.d.style.display = "block"; sec.b.style.background = "#2f6f4f"; sec.b.style.color = "#fff";
    };
    const sectionDe = (rayon) => {
      if (sections.has(rayon)) return sections.get(rayon);
      const d = document.createElement("div"), b = document.createElement("button");
      b.style.cssText = "border:0;border-radius:14px;padding:4px 10px;font:inherit;font-size:12px;cursor:pointer";
      barre.appendChild(b); zone.appendChild(d);
      const sec = { d, b, n: 0, titre: rayon };
      b.onclick = () => montrer(sec);
      sections.set(rayon, sec);
      if (sections.size === 1) montrer(sec); else { d.style.display = "none"; b.style.background = "#eee"; }
      return sec;
    };
    if (new Set(liste.map((a) => a.a || "Autres")).size < 2) barre.style.display = "none";
    const parRayon = [...liste].sort((x, y) => (x.a || "~").localeCompare(y.a || "~"));
    for (const a of parRayon) {
      const k = motCle(a.t);
      const sec = sectionDe(a.a || "Autres");
      sec.n++; sec.b.textContent = sec.titre + " (" + sec.n + ")";
      const l = document.createElement("div");
      l.style.cssText = "display:flex;gap:6px;align-items:center;margin:2px 0;font-size:13px";
      l.innerHTML = '<input type="checkbox" checked><span title="' + echap(a.t) + '" style="flex:0 0 32%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + echap(a.t)
        + '</span><select style="flex:1 1 auto;min-width:0;width:0;font-size:12px"><option>recherche…</option></select><input type="number" min="1" max="20" value="' + (a.q || 1) + '" style="width:3.2em">';
      sec.d.appendChild(l);
      const ligne = { a, k, l, produits: [], change: false };
      l.querySelector("select").addEventListener("change", () => { ligne.change = true; });
      lignes.push(ligne);
    }
    const pied = document.createElement("p");
    pied.innerHTML = '<button id="rp-ajouter" style="background:#2f6f4f;color:#fff;border:0;border-radius:8px;padding:9px 14px;font:inherit;cursor:pointer">Ajouter au panier</button> <button id="rp-fermer" style="background:#eee;border:0;border-radius:8px;padding:9px 14px;font:inherit;cursor:pointer">Fermer</button>';
    cadre.appendChild(pied);
    cadre.querySelector("#rp-fermer").onclick = () => { cadre.dataset.ferme = "1"; cadre.remove(); };
    let recherche = true;
    cadre.querySelector("#rp-ajouter").onclick = async () => {
      console.info("[pantarr→drive] clic sur Ajouter au panier");
      if (recherche) { etat("Patiente : recherche des produits en cours…"); return; }
      panier = panier || panierStocke();
      if (!panier) { etat("Panier introuvable : ajoute puis retire n'importe quel produit sur le site, puis clique de nouveau sur « Ajouter au panier »."); return; }
      const choisis = lignes.filter((x) => x.l.querySelector("input").checked && x.produits.length);
      let ok = 0; const echecs = [], achats = [];
      for (const x of choisis) {
        const id = x.l.querySelector("select").value, q = Math.max(1, Number(x.l.querySelector("input[type=number]").value) || 1);
        const maintenant = horodatage();
        etat("Ajout " + (ok + echecs.length + 1) + " / " + choisis.length + "…");
        try {
          const r = await f0("/api/service/cart/v2/carts/" + panier + "?storeId=" + magasin, {
            method: "PATCH", credentials: "include", headers: Object.assign({}, h, { "content-type": "application/json" }),
            body: JSON.stringify({ customerDateTime: maintenant, events: [{ catalog: "PDV", itemId: id, quantity: q, dateTime: maintenant, type: "QUANTITY" }] }) });
          if (!r.ok) throw new Error(String(r.status));
          const produit = x.produits.find((p) => String(p.itemId) === String(id));
          if (produit) { const prix = parseFloat(String(champ(produit, /^(prix|price|prixUnitaire|pvi)$/i) || "").replace(",", ".")); achats.push({ name: nomProduit(produit), quantity: q, price: isNaN(prix) ? null : prix });
            apprendreRayon(rayons, x.a.a || "", motCleArticle(x.k), produit); }
          if (x.change) retenir(x.k, id, x.a.t, x.l.querySelector("select").selectedOptions[0]?.textContent?.replace(/^★ /, "").replace(/ —.*$/, "").replace(/ \(.*\)$/, "") || "");
          ok++;
        } catch (e) { echecs.push(x.a.t + " (" + e.message + ")"); }
        await pause(400);
      }
      // Historique d'achats de Pantarr : ce qui vient d'être mis au panier compte comme acheté aujourd'hui
      try { localStorage.setItem(CLE_RAYONS, JSON.stringify(rayons)); } catch (e) { /* private mode */ }
      if (achats.length) pantarr("order", { method: "POST", headers: Object.assign({ "content-type": "application/json" }, AUTH), body: JSON.stringify({ items: achats }) }).catch(() => {});
      etat(ok + " article(s) ajouté(s) au panier" + (echecs.length ? ", échecs : " + echecs.join(" ; ") : "") + ". Recharge la page pour voir le panier, puis choisis ton créneau.");
    };
    // v19 : 4 items searched at once, each search done once (several items may search the same word)
    const cache = new Map();
    const chercher = (mot) => {
      const cle = sansAccent(mot).trim();
      if (!cache.has(cle)) cache.set(cle, chercherSite(mot).catch((e) => { cache.delete(cle); throw e; }));
      return cache.get(cle);
    };
    const chercherSite = async (mot) => {
          const arret = new AbortController(), minuterie = setTimeout(() => arret.abort(), 10000);
          const r = await f0("/api/service/produits/v3/pdvs/" + magasin + "/products/suggestions?keyword=" + encodeURIComponent(mot), { headers: h, credentials: "include", signal: arret.signal });
          clearTimeout(minuterie);
          if (!r.ok) throw new Error("recherche " + r.status);
          const liste = (await r.json()).produits || [];
          if (liste[0] && !window.__rpChamps) {   // diagnostic : champs d'un produit du site (une fois)
            window.__rpChamps = true;
            console.info("[pantarr→drive] champs d'un produit : " + JSON.stringify(Object.fromEntries(Object.entries(liste[0]).filter(([, v]) => typeof v !== "object").map(([k, v]) => [k, String(v).slice(0, 40)]))));
          }
          return liste;
    };
    const preparer = async (x) => {
      try {
        // Produits déjà achetés d'abord (★), puis les résultats ordinaires de la recherche
        const vus = new Set(), etoiles = new Map();
        x.produits = [];
        // Produit préféré (réglage « Produits préférés » de la page repas, ex. « Eau : Native ») : cherché en premier
        if (x.a.r) {
          const motsR = motsDe(x.a.r);
          for (const t of await chercher(x.a.r)) {
            const nom = motsDe(nomProduit(t));
            if (!vus.has(String(t.itemId)) && motsR.every((w) => nom.some((m) => pareil(m, w)))) {
              vus.add(String(t.itemId)); etoiles.set(String(t.itemId), { n: 0, s: "prefere" }); x.produits.push(t);
              if (x.produits.length >= 2) break;
            }
          }
        }
        // Article venu du stock : son produit le plus acheté d'abord (ex. « Couches » → Pampers Baby-Dry Pants)
        const exact = x.a.p ? habituels.filter((hp) => hp.l === x.a.p) : [];
        const candidats = exact.concat(habituelsDe(habituels, x.k).filter((hp) => !exact.includes(hp)));
        // Libellé de caisse abrégé (« PAMPERS BD CCHES GEA ») : recherche par la marque + l'article (« pampers couches »)
        const motDe = (hp) => (hp.s === "magasin" ? motsDe(hp.l)[0] + " " + motCle(x.a.t.replace(/\s+(de|pour)\s+[A-ZÉ][a-zéè]+/g, "")) : motHabituel(hp));
        // all the searches of the item at once (the usual products and the item itself)
        const [general, ...trouvesDe] = await Promise.all([chercher(x.k), ...candidats.map((hp) => chercher(motDe(hp)).catch(() => []))]);
        for (const [i, hp] of candidats.entries()) {
          const trouves = trouvesDe[i];
          // v17 : the product found on the site must also BE the item (its name there is « Marque - Nom » ; the bought
          // label may come from a receipt or an order mail, without the brand set apart: « Brioche Pasquier Biscotte »)
          const p = trouves.find((t) => !vus.has(String(t.itemId)) && correspond(hp.l, nomProduit(t)) && estLArticle(x.k, nomProduit(t)) && !deMarque(nomProduit(t), marques.ban));
          if (!p) console.info("[pantarr→drive] « " + hp.l + " » : aucun résultat qui soit l'article, pas d'étoile");
          if (p) { vus.add(String(p.itemId)); etoiles.set(String(p.itemId), hp); x.produits.push(p); }
        }
        // the site's results, the item itself first (« ail » : the garlic, not « Taureau Ailé - Riz Basmati »)
        const resultats = general.filter((p) => !vus.has(String(p.itemId)));
        classer(resultats, x.k, x.a.a || "", rayons, nomProduit, marques)
          .forEach((p) => { if (x.produits.length < 10 && !vus.has(String(p.itemId))) { vus.add(String(p.itemId)); x.produits.push(p); } });
        const sel = x.l.querySelector("select");
        if (!x.produits.length) { sel.innerHTML = "<option>aucun produit trouvé</option>"; x.l.querySelector("input").checked = false; return; }
        const connu = choixConnu(x.k);
        sel.innerHTML = x.produits.map((p) => { const n = etoiles.get(String(p.itemId)); return '<option value="' + echap(p.itemId) + '"' + (String(p.itemId) === connu ? " selected" : "") + ">" + (n ? "★ " : "") + echap(nomProduit(p)) + echap(prixProduit(p)) + (n ? (n.s === "prefere" ? " (préféré)" : " (" + n.n + (n.s === "magasin" ? " fois en magasin" : " commande" + (n.n > 1 ? "s" : "")) + ")") : "") + "</option>"; }).join("");
      } catch (e) { console.warn("[pantarr→drive] recherche « " + x.k + " »", e); x.l.querySelector("select").innerHTML = "<option>erreur de recherche</option>"; x.l.querySelector("input").checked = false; }
    };
    const file = [...lignes];
    let fait = 0;
    etat("Recherche des produits : 0 / " + lignes.length + "…");
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (file.length) { await preparer(file.shift()); etat("Recherche des produits : " + (++fait) + " / " + lignes.length + "…"); }
    }));
    recherche = false;
    etat(liste.length + " article(s) : vérifie les produits et les quantités, puis « Ajouter au panier ».");
  };
  lancer();
})();
