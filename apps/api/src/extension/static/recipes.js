// Pantarr extension — runs on popular recipe sites (isolated world, the page's own rules do not apply): a button
// to add the recipe of the page to Pantarr, or every recipe listed on the page (the favourites or notebook of the
// signed-in user, a search) one after the other. Mealie reads each recipe page on the Pantarr side.
/* global __RECIPE_SITES__ -- replaced by the list of sites when the extension is built (recipe-sites.ts) */
(() => {
  const SITES = __RECIPE_SITES__;
  const site = SITES.find((s) => s.origins.includes(location.origin));
  if (!site || window.top !== window) return;
  const fr = (document.documentElement.lang || navigator.language || "").startsWith("fr");
  const T = fr ? {
    add: "Ajouter à Pantarr", adding: "Ajout…", added: "Ajoutée à Pantarr", known: "Déjà dans Pantarr", open: "Ouvrir",
    many: (n) => `Importer les ${n} recettes de cette page`, favs: (n) => `Importer mes ${n} favoris dans Pantarr`,
    confirm: (n) => `Importer ${n} recettes dans Pantarr ? Cela prend quelques secondes par recette ; gardez cette page ouverte.`,
    progress: (i, n) => `Import… ${i}/${n}`, done: (a, d, f) => `${a} importée${a > 1 ? "s" : ""}${d ? `, ${d} déjà là` : ""}${f ? `, ${f} échec${f > 1 ? "s" : ""}` : ""}`,
    failed: "Échec de l'import", connect: "Connectez l'extension à Pantarr (icône Pantarr de la barre d'outils)", close: "Fermer",
    expired: "Connexion à Pantarr expirée : reconnectez l'extension (icône Pantarr de la barre d'outils, nouveau code dans Pantarr)",
  } : {
    add: "Add to Pantarr", adding: "Adding…", added: "Added to Pantarr", known: "Already in Pantarr", open: "Open",
    many: (n) => `Import the ${n} recipes of this page`, favs: (n) => `Import my ${n} favourites into Pantarr`,
    confirm: (n) => `Import ${n} recipes into Pantarr? It takes a few seconds per recipe; keep this page open.`,
    progress: (i, n) => `Importing… ${i}/${n}`, done: (a, d, f) => `${a} imported${d ? `, ${d} already there` : ""}${f ? `, ${f} failed` : ""}`,
    failed: "Import failed", connect: "Connect the extension to Pantarr (Pantarr icon of the toolbar)", close: "Close",
    expired: "Connection to Pantarr expired: connect the extension again (Pantarr icon of the toolbar, new code in Pantarr)",
  };
  const recipeUrl = new RegExp(`^${site.recipe}`);
  const FAVOURITES = /(carnet|favori|favorite|favourite|saved|bookmark|mes-recettes|my-recipes|cookbook|collection|merkliste)/i;

  // ── What the page holds ──
  /** A schema.org Recipe in the page's data (JSON-LD, also inside « @graph » or a list). */
  const isRecipePage = () => [...document.querySelectorAll('script[type="application/ld+json"]')].some((s) => {
    try {
      const walk = (x) => !!x && (Array.isArray(x) ? x.some(walk) : typeof x === "object" && ([].concat(x["@type"] || []).includes("Recipe") || walk(x["@graph"])));
      return walk(JSON.parse(s.textContent || "null"));
    } catch { return false; }
  });
  /** The recipes linked from the page (same site, recipe addresses), each once. */
  const listedRecipes = () => {
    const seen = new Set();
    for (const a of document.querySelectorAll("a[href]")) {
      let u;
      try { u = new URL(a.getAttribute("href"), location.href); } catch { continue; }
      if (!site.origins.includes(u.origin) || !recipeUrl.test(u.pathname)) continue;
      const clean = u.origin + u.pathname;
      if (clean !== location.origin + location.pathname) seen.add(clean);
    }
    return [...seen];
  };

  // ── Pantarr ──
  const config = () => chrome.storage.local.get(["api", "key", "household"]);
  async function call(path, body) {
    const c = await config();
    if (!c.api || !c.key) throw new Error(T.connect);
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(`${c.api}/bridge/recipes/${path}${sep}household=${encodeURIComponent(c.household || "")}`, {
      method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${c.key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    // 401: the key of the extension is no longer valid (account removed, key revoked): it must be connected again
    if (r.status === 401) { chrome.storage.local.set({ expired: true }); throw new Error(T.expired); }
    if (!r.ok) throw new Error(j.message || `${T.failed} (${r.status})`);
    return j;
  }

  // ── The button ──
  const box = document.createElement("div");
  box.setAttribute("style", "position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;gap:6px;align-items:center;font:600 14px/1.2 system-ui,sans-serif;"
    + "background:#2f9e44;color:#fff;border-radius:999px;padding:4px 6px 4px 4px;box-shadow:0 4px 16px rgba(0,0,0,.25)");
  const icon = document.createElement("span");
  icon.textContent = "🥕";
  icon.setAttribute("style", "background:#fff;border-radius:50%;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center");
  const main = document.createElement("button");
  main.setAttribute("style", "all:unset;cursor:pointer;padding:6px 8px");
  const link = document.createElement("a");
  link.setAttribute("style", "color:#fff;text-decoration:underline;display:none;padding:0 6px");
  link.target = "_blank"; link.rel = "noopener"; link.textContent = T.open;
  const close = document.createElement("button");
  close.textContent = "×"; close.title = T.close;
  close.setAttribute("style", "all:unset;cursor:pointer;padding:0 8px;font-size:18px;opacity:.8");
  close.onclick = () => box.remove();
  box.append(icon, main, link, close);
  const say = (text, busy = false) => { if (main.textContent !== text) main.textContent = text; main.disabled = busy; main.style.opacity = busy ? ".8" : "1"; };
  const opened = (base, url) => { if (base && url) { link.href = base + url; link.style.display = "inline"; } };

  let mode = "";   // « one » (a recipe page) or « many » (a page listing recipes)
  async function setup() {
    if (isRecipePage()) {
      if (mode === "one") return;
      mode = "one";
      say(T.add);
      main.onclick = async () => {
        say(T.adding, true);
        try { const r = await call("import", { url: location.href }); say(r.duplicate ? T.known : T.added, true); opened(r.base, r.url); }
        catch (e) { say(e.message || T.failed); }
      };
      document.documentElement.append(box);
      config().then((c) => c.key && call(`known?url=${encodeURIComponent(location.href)}`)).then((k) => { if (k && k.known) { say(T.known, true); opened(k.base, k.url); } }).catch(() => undefined);
      return;
    }
    const urls = listedRecipes();
    if (urls.length < 2) { if (mode === "many") { box.remove(); mode = ""; } return; }
    if (mode === "many" && main.disabled) return;   // an import is running
    mode = "many";
    say(FAVOURITES.test(location.pathname + location.search) ? T.favs(urls.length) : T.many(urls.length));
    main.onclick = async () => {
      const list = listedRecipes();
      if (!confirm(T.confirm(list.length))) return;
      let added = 0, dup = 0, failed = 0, base = "";
      for (let i = 0; i < list.length; i++) {
        say(T.progress(i + 1, list.length), true);
        try { const r = await call("import", { url: list[i] }); base = r.base; if (r.duplicate) dup++; else added++; }
        catch (e) { failed++; if ([T.connect, T.expired].includes(String(e.message))) { say(String(e.message)); return; } }
      }
      say(T.done(added, dup, failed), true);
      opened(base, "/recipes");
    };
    document.documentElement.append(box);
  }
  // pages that fill themselves after loading (Jow, favourites): looked at again when they change
  let timer = 0;
  new MutationObserver((changes) => {
    if (changes.every((m) => box.contains(m.target) || m.target === box)) return;   // our own button
    clearTimeout(timer); timer = setTimeout(setup, 800);
  }).observe(document.documentElement, { childList: true, subtree: true });
  setup();
})();
