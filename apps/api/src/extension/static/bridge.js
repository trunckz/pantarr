// Pantarr extension — runs on the store sites (isolated world): gives the store scripts (page world) the Pantarr
// address, the bridge key and the household saved when the extension was connected. Nothing is sent before that.
(() => {
  let cfg = null;
  const send = () => { if (cfg) document.dispatchEvent(new CustomEvent("pantarr-config", { detail: JSON.stringify(cfg) })); };
  document.addEventListener("pantarr-config-request", send);
  chrome.storage.local.get(["api", "key", "household"]).then((v) => {
    if (v && v.api && v.key) { cfg = { api: v.api, key: v.key, household: v.household || "" }; send(); }
  });
})();
