import asyncio
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from probe import run_scan_streaming, run_ssh_scan_streaming


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send_json(self, status, body):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {"status": "ok"})
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path not in ("/scan", "/scan-ssh"):
            self._send_json(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "invalid json"})
            return

        subnets = body.get("subnets", [])
        port = body.get("port", 443)
        liveness_timeout_ms = body.get("liveness_timeout_ms", 1500)
        handshake_timeout_ms = body.get("handshake_timeout_ms", 4000)
        concurrency = body.get("concurrency", 100)
        starttls = body.get("starttls")

        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

        def emit(obj):
            line = (json.dumps(obj) + "\n").encode("utf-8")
            chunk = f"{len(line):x}\r\n".encode("ascii") + line + b"\r\n"
            try:
                self.wfile.write(chunk)
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass

        try:
            if self.path == "/scan":
                asyncio.run(run_scan_streaming(
                    subnets, port, liveness_timeout_ms, handshake_timeout_ms, concurrency, emit, starttls
                ))
            else:
                asyncio.run(run_ssh_scan_streaming(
                    subnets, port, liveness_timeout_ms, concurrency, emit
                ))
        except Exception as exc:
            emit({"stage": "error", "detail": repr(exc)})

        try:
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", 8080), Handler)
    server.serve_forever()
