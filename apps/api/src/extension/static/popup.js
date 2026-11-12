// Pantarr extension — popup: connects the extension to a Pantarr account with the code shown in Pantarr
// (Settings → Connectors → Browser extension), or shows to which household it is connected.
const DEFAULT_API = "__DEFAULT_BASE__";
const fr = (navigator.language || "").startsWith("fr");
const T = fr ? {
  intro: "Pour remplir le panier de votre drive et lire vos tickets Lidl Plus depuis Pantarr : dans Pantarr, Réglages → Connecteurs → Extension du navigateur → « Obtenir un code ».",
  code: "Code affiché dans Pantarr", other: "Autre adresse de Pantarr", address: "Adresse de Pantarr", connect: "Connecter",
  connected: "Extension connectée", howto: "Dans Pantarr, « Envoyer au drive » ouvre le site du magasin et remplit le panier. Vos tickets Lidl Plus sont lus quand vous visitez lidl.fr connecté.",
  open: "Ouvrir Pantarr", disconnect: "Déconnecter", household: "Foyer", badCode: "Code inconnu ou expiré : demandez-en un nouveau dans Pantarr.",
  denied: "Autorisez l'accès à cette adresse pour connecter l'extension.", failed: "Connexion impossible",
  expired: "La connexion à Pantarr n'est plus valable (compte supprimé ou clé révoquée) : déconnectez puis reconnectez l'extension avec un nouveau code.",
} : {
  intro: "To fill your online store basket and read your Lidl Plus receipts from Pantarr: in Pantarr, Settings → Connectors → Browser extension → \"Get a code\".",
  code: "Code shown in Pantarr", other: "Other Pantarr address", address: "Pantarr address", connect: "Connect",
  connected: "Extension connected", howto: "In Pantarr, \"Send to the online store\" opens the store's site and fills the basket. Your Lidl Plus receipts are read when you visit the Lidl site signed in.",
  open: "Open Pantarr", disconnect: "Disconnect", household: "Household", badCode: "Unknown or expired code: get a new one in Pantarr.",
  denied: "Allow the access to this address to connect the extension.", failed: "Connection failed",
  expired: "The connection to Pantarr is no longer valid (account removed or key revoked): disconnect, then connect the extension again with a new code.",
};
document.querySelectorAll("[data-t]").forEach((e) => { e.textContent = T[e.dataset.t]; });
const $ = (id) => document.getElementById(id);
$("api").value = DEFAULT_API;

async function show() {
  const v = await chrome.storage.local.get(["api", "key", "household", "householdName", "base"]);
  $("connect").hidden = !!v.key; $("connected").hidden = !v.key;
  if (v.key) $("who").textContent = `${T.household} : ${v.householdName || "?"} — ${new URL(v.base || v.api).host}`;
  $("expired").hidden = true;
  if (!v.key) return;
  // is the key still valid? a bridge key gets 403 on anything but the bridge, an unknown key 401
  try {
    const r = await fetch(v.api + "/auth/me", { headers: { Authorization: `Bearer ${v.key}` } });
    const expired = r.status === 401;
    await chrome.storage.local.set({ expired });
    if (expired) { $("expired").textContent = T.expired; $("expired").hidden = false; }
  } catch { /* Pantarr not reachable now: nothing to say */ }
}

$("go").onclick = async () => {
  $("error").hidden = true;
  const base = ($("api").value.trim() || DEFAULT_API).replace(/\/+$/, "");
  const code = $("code").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  try {
    const origin = new URL(base).origin;
    if (origin !== new URL(DEFAULT_API).origin && !(await chrome.permissions.request({ origins: [origin + "/*"] }))) throw new Error(T.denied);
    const r = await fetch(base + "/api/v1/extension/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    if (r.status === 400 || r.status === 404) throw new Error(T.badCode);
    if (!r.ok) throw new Error(`${T.failed} (${r.status})`);
    const p = await r.json();
    await chrome.storage.local.set({ api: p.api, key: p.key, household: p.household, householdName: p.householdName, base });
    show();
  } catch (e) { $("error").textContent = e.message || T.failed; $("error").hidden = false; }
};
$("code").addEventListener("keydown", (e) => { if (e.key === "Enter") $("go").click(); });
$("open").onclick = async () => { const v = await chrome.storage.local.get(["base"]); chrome.tabs.create({ url: v.base || DEFAULT_API }); };
$("off").onclick = async () => { await chrome.storage.local.clear(); show(); };
show();
