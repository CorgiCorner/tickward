# Minimal tickward webhook receiver for Python 3.10+ (standard library only).
# Usage: set TICKWARD_WEBHOOK_SECRET, then run `python receiver.py`.
# Production: terminate HTTPS at a trusted reverse proxy; never expose this HTTP listener directly.

import hashlib
import hmac
import json
import os
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET = os.environ.get("TICKWARD_WEBHOOK_SECRET", "").encode("utf-8")
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8787"))
MAX_AGE_SECONDS = 300
LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}


def verify_signature(header: str, raw_body: bytes) -> bool:
    parts: dict[str, str] = {}
    for part in header.split(","):
        if "=" not in part:
            continue
        name, value = part.split("=", 1)
        parts[name] = value
    timestamp = parts.get("t", "")
    expected = parts.get("v1", "")
    if not timestamp or not expected:
        return False
    if abs(time.time() - float(timestamp)) > MAX_AGE_SECONDS:
        return False
    signed = f"{timestamp}.".encode("utf-8") + raw_body
    computed = hmac.new(SECRET, signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, expected)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802 (http.server API)
        raw_body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        header = self.headers.get("tickward-signature", "")

        if not verify_signature(header, raw_body):
            self.send_response(401)
            self.end_headers()
            return

        event = json.loads(raw_body)
        print(
            "[tickward] webhook received",
            {
                "type": event["type"],
                "id": event["id"],
                "object": event["data"]["object"],
            },
            flush=True,
        )
        # Handle the event here. Keep it idempotent - deliveries can retry.

        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")


if __name__ == "__main__":
    if HOST not in LOOPBACK_HOSTS and os.environ.get("TICKWARD_TLS_TERMINATED") != "true":
        raise RuntimeError(
            "Refusing a non-loopback HTTP listener. Terminate TLS at a trusted "
            "reverse proxy and set TICKWARD_TLS_TERMINATED=true."
        )
    # This standard-library server is intentionally restricted to loopback or
    # a TLS-terminating reverse proxy by the guard above.
    HTTPServer((HOST, PORT), Handler).serve_forever()  # NOSONAR
