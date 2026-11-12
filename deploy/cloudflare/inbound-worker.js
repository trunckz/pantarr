// Cloudflare Email Worker: receipts forwarded to <code>@<domain> go to Pantarr.
// Cloudflare: Email Routing on a subdomain (e.g. recus.example.com), catch-all → action « Send to a Worker » → this
// worker. Variables: PANTARR_URLS (one or more Pantarr addresses, comma separated: an address code belongs to one of
// them, each says 404 for the others), PANTARR_INBOUND_SECRET (secret, the same on every instance). An address known
// nowhere is refused: the sender is told.
export default {
  async email(message, env) {
    const body = await new Response(message.raw).arrayBuffer();
    const urls = String(env.PANTARR_URLS ?? env.PANTARR_URL ?? "").split(",").map((u) => u.trim().replace(/\/$/, "")).filter(Boolean);
    for (const url of urls) {
      const r = await fetch(`${url}/api/v1/inbound/mail`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.PANTARR_INBOUND_SECRET}`, "Content-Type": "application/octet-stream", "X-Pantarr-To": message.to },
        body,
      });
      if (r.ok) return;
      if (r.status === 413) { message.setReject("Message too large"); return; }
      if (r.status !== 404) throw new Error(`Pantarr ${url}: ${r.status}`);   // temporary: Cloudflare reports a delivery failure
    }
    message.setReject("Unknown address");
  },
};
