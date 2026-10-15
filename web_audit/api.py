"""HTTP API. Run one process: uvicorn web_audit.api:app --host 0.0.0.0."""

import hmac
import json
import os
import re
import secrets
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator

from web_audit.safe_fetch import public_url
from web_audit.storage import QueueFull, Storage
from web_audit.worker import Worker


class BodyLimit:
    """Bound API input before JSON parsing, including chunked requests."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST":
            return await self.app(scope, receive, send)
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > 4096:
                response = Response("Request is too large", status_code=413)
                return await response(scope, receive, send)
            if not message.get("more_body", False):
                break
        sent = False

        async def bounded_receive():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, bounded_receive, send)


class ScanRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    max_pages: int = Field(default=5, ge=1, le=20)
    max_depth: int = Field(default=1, ge=0, le=3)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value):
        value = value.strip()
        try:
            parts = urlsplit(value)
            port = parts.port
        except ValueError as exc:
            raise ValueError("Enter a valid HTTP or HTTPS URL") from exc
        if (
            parts.scheme not in {"http", "https"}
            or not parts.hostname
            or parts.username
            or parts.password
            or port not in {None, 80, 443}
        ):
            raise ValueError("Enter an HTTP or HTTPS URL without credentials")
        return public_url(value)


def export_filename(scan):
    """Name exports after the audited site, not the internal scan id."""
    host = (urlsplit(scan["url"]).hostname or "").lower().removeprefix("www.")
    stem = re.sub(r"[^a-z0-9.-]+", "-", host).strip("-.")[:60]
    return f"{stem or 'scan'}-audit.json"


def create_app(db_path=None, crawl_fn=None, start_worker=True):
    @asynccontextmanager
    async def lifespan(application):
        storage = Storage(db_path or os.getenv("AUDITOR_DB_PATH", "data/scans.sqlite3"))
        application.state.storage = storage
        if crawl_fn is None:
            from web_audit.crawler import crawl

            runner = crawl
        else:
            runner = crawl_fn
        worker = Worker(storage, runner)
        application.state.worker = worker
        if start_worker:
            worker.start()
        yield
        if start_worker:
            worker.close()

    application = FastAPI(
        title="Web Launch Auditor", version="1.0.0", lifespan=lifespan
    )

    application.add_middleware(BodyLimit)

    @application.middleware("http")
    async def session(request: Request, call_next):
        if request.url.path.startswith("/api/"):
            key = os.getenv("AUDITOR_API_KEY")
            if key and not hmac.compare_digest(
                request.headers.get("x-api-key", ""), key
            ):
                return Response(status_code=401)
            token = request.cookies.get("auditor_session", "")
            fresh = not re.fullmatch(r"[a-f0-9]{64}", token)
            request.state.owner = secrets.token_hex(32) if fresh else token
            response = await call_next(request)
            if fresh:
                response.set_cookie(
                    "auditor_session",
                    request.state.owner,
                    httponly=True,
                    secure=os.getenv("AUDITOR_COOKIE_SECURE", "false").lower()
                    == "true",
                    samesite="lax",
                    max_age=60 * 60 * 24 * 365,
                    path="/",
                )
            response.headers["Cache-Control"] = "no-store"
            return response
        return await call_next(request)

    @application.get("/health")
    def health():
        return {"status": "ok"}

    @application.post("/api/scans", status_code=202)
    def submit(body: ScanRequest, request: Request):
        try:
            return request.app.state.storage.create(
                request.state.owner, body.url, body.max_pages, body.max_depth
            )
        except QueueFull as exc:
            raise HTTPException(
                429,
                "Scan capacity reached. Try again shortly.",
                headers={"Retry-After": "30"},
            ) from exc

    @application.get("/api/scans")
    def history(request: Request):
        return {"items": request.app.state.storage.list(request.state.owner)}

    def owned_scan(request, scan_id):
        scan = request.app.state.storage.get(scan_id, request.state.owner)
        if scan is None:
            raise HTTPException(404, "Scan not found")
        return scan

    @application.get("/api/scans/{scan_id}")
    def detail(scan_id: str, request: Request):
        return owned_scan(request, scan_id)

    @application.delete("/api/scans/{scan_id}", status_code=204)
    def delete(scan_id: str, request: Request):
        scan = owned_scan(request, scan_id)
        if scan["status"] not in {"completed", "failed"}:
            raise HTTPException(409, "Wait for this scan to finish before deleting it")
        request.app.state.storage.delete(scan_id, request.state.owner)
        return Response(status_code=204)

    @application.get("/api/scans/{scan_id}/export")
    def export(scan_id: str, request: Request):
        scan = owned_scan(request, scan_id)
        return Response(
            json.dumps(scan, indent=2),
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="{export_filename(scan)}"'
            },
        )

    return application


app = create_app()
