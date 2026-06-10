# Minimal tickward webhook receiver for Python 3.10+ (standard library only).
# Usage: set TICKWARD_WEBHOOK_SECRET, then run `python receiver.py`.

import hashlib
import hmac
import json
import os
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET = os.environ.get("TICKWARD_WEBHOOK_SECRET", "").encode("utf-8")
PORT = int(os.environ.get("PORT", "8787"))
MAX_AGE_SECONDS = 300


def verify_signature(header: str, raw_body: bytes) -> bool:
    parts = dict(part.split("=", 1) for part in header.split(",") if "=" in part)
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
        print(f"[tickward] {event['type']} {event['id']}", event["data"]["object"])
        # Handle the event here. Keep it idempotent - deliveries can retry.

        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")


if __name__ == "__main__":
    HTTPServer(("", PORT), Handler).serve_forever()
