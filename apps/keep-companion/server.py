"""pantarr-keep: the Google Keep side of Pantarr's list sync (Keep has no public API; gkeepapi with a master token).

POST /pull  {email, token, list}            → {"items": [{"id", "text", "checked"}]}
POST /check {email, token, list, changes}   → {"ok": true}   changes = [{"id", "checked"}]
GET  /health                                → {"ok": true}

Stateless apart from one logged-in Keep client per account (resynced on each call). Listens on the internal network
only: the credentials come with each request from Pantarr, which keeps them encrypted.
"""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import gkeepapi

CLIENTS: dict[str, gkeepapi.Keep] = {}
LOCK = threading.Lock()


def keep_list(email: str, token: str, name: str):
    k = CLIENTS.get(email)
    if k is None:
        k = gkeepapi.Keep()
        k.authenticate(email, token)
        CLIENTS[email] = k
    else:
        k.sync()
    for n in k.all():
        if isinstance(n, gkeepapi.node.List) and not n.trashed and n.title.strip().lower() == name.strip().lower():
            return k, n
    raise LookupError(f"Keep list « {name} » not found")


class Handler(BaseHTTPRequestHandler):
    def reply(self, code: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.reply(200 if self.path == "/health" else 404, {"ok": self.path == "/health"})

    def do_POST(self):
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or "{}")
            with LOCK:
                k, note = keep_list(req["email"], req["token"], req.get("list") or "Shopping")
                if self.path == "/pull":
                    items = [{"id": i.id, "text": (i.text or "").strip(), "checked": bool(i.checked)} for i in note.items if not i.deleted]
                    return self.reply(200, {"items": items})
                if self.path == "/check":
                    wanted = {c["id"]: bool(c["checked"]) for c in req.get("changes", [])}
                    for i in note.items:
                        if i.id in wanted:
                            i.checked = wanted[i.id]
                    k.sync()
                    return self.reply(200, {"ok": True})
            self.reply(404, {"error": "unknown route"})
        except LookupError as e:
            self.reply(404, {"error": str(e)})
        except Exception as e:  # authentication refused, network…: the client is rebuilt next time
            CLIENTS.pop((locals().get("req") or {}).get("email", ""), None)
            self.reply(502, {"error": f"{type(e).__name__}: {e}"[:300]})

    def log_message(self, fmt, *args):  # no credentials in the logs: only the route and the status
        if "POST" in (args[0] if args else ""):
            print(f"{self.path} {args[1] if len(args) > 1 else ''}", flush=True)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), Handler).serve_forever()
