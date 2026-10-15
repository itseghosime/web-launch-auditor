# MVP delivery plan

Build from the week-two scanner while preserving its CLI and existing checks.
Each verified change receives a conventional Git commit.

1. Public-destination fetcher, bounded same-origin crawl, robots policy and tests.
2. FastAPI API, persistent SQLite queue, session-owned history and API tests.
3. Modern responsive Next.js dashboard: submit, poll, inspect, filter, export,
   retry and delete saved scans.
4. Container deployment, persistent storage, environment configuration and CI.
5. End-to-end verification, security review, accessibility polish and launch docs.

## Product boundaries

The MVP inspects server-rendered HTML for metadata, structure, accessibility
hints and social sharing fields. It is not a browser-based performance audit or
an accessibility certification. Crawls are limited to 20 pages and depth 3.
History belongs to an anonymous browser session; accounts and cross-device
history are future features. One API process owns one persistent background
worker. Actual hosted deployment requires a hosting account and persistent disk.

## Interface contract

- `POST /api/scans`: URL, maximum pages and depth; returns queued scan.
- `GET /api/scans`: current session's recent scans.
- `GET /api/scans/{id}`: state, progress and page results.
- `DELETE /api/scans/{id}`: removes a finished scan.
- `GET /api/scans/{id}/export`: downloads structured JSON.
- `GET /health`: service health.

Next.js proxies the API on the same origin and forwards the HttpOnly session
cookie. Secrets stay on the server. The crawler connects only to validated
public IP addresses and preserves TLS hostname verification.
