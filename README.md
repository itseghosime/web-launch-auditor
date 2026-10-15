# Web Launch Auditor

A working website audit MVP: submit a public URL, crawl a bounded set of pages,
review HTML findings, and revisit or export saved scans. The Next.js dashboard
uses a FastAPI backend with a durable SQLite queue. The original single-page
Python CLI is also available.

## Run locally

Use Python 3.11+ and Node.js 22. In the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn web_audit.api:app --host 127.0.0.1 --port 8000
```

In another terminal:

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. Scan records persist in `data/scans.sqlite3`.
The dashboard forwards requests and session cookies through its own API routes;
the browser does not need direct access to the backend. Keep one backend process.

Alternatively, with Docker Compose installed:

```bash
cp .env.example .env
docker compose up --build
```

Open <http://localhost:3000>. Only the dashboard is exposed on your computer;
the backend is private to Compose. The `scans` volume retains history when
containers restart. `docker compose down` keeps that volume.

## What it checks

Checks cover titles and descriptions, headings and document structure, image
alternative text, canonical URLs, Open Graph metadata, and internal link discovery.
Results include evidence and suggested fixes. Crawling follows same-origin links,
respects robots.txt, and records individual page failures. The dashboard supports
scan submission, progress, saved history, findings, JSON export and deletion.

Scans accept 1–20 pages and depth 0–3 (defaults: 5 pages and depth 1). The hosted
crawler uses a 90-second deadline, a 1 MB response limit, bounded findings and
links, and public-address validation with DNS-pinned connections. Unsupported
or inaccessible pages produce an error rather than blocking the queue forever.

## Saved scans and limits

History belongs to an anonymous, opaque HttpOnly browser cookie. Clearing that
cookie or changing browsers loses access to previous history; there are no user
accounts or recovery flow. Anyone with the cookie can access that session's scans.
URLs and findings are stored on the backend; avoid putting secrets in scan URLs.

There are at most 20 queued/running scans globally and 3 per session. A persistent
global admission limit allows 30 submissions per 10 minutes. Capacity errors return
HTTP 429. Completed history is pruned as new scans arrive: roughly the latest 500
records are retained globally, and the dashboard lists the latest 100 per session.
Export results you need to keep. Active scans cannot be deleted. Interrupted scans
are requeued when the backend restarts.

## API

The interactive backend reference is at <http://127.0.0.1:8000/docs> when running
locally. Requests use the `auditor_session` cookie returned by the server.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Backend health |
| POST | `/api/scans` | Queue `{ "url": "https://example.com", "max_pages": 5, "max_depth": 1 }` |
| GET | `/api/scans` | Session history |
| GET | `/api/scans/{id}` | Status and results |
| GET | `/api/scans/{id}/export` | Download JSON |
| DELETE | `/api/scans/{id}` | Delete a completed or failed scan |

## Command line

```bash
python -m web_audit --file fixtures/good.html --base-url https://example.com/
python -m web_audit --url https://example.com/
python -m web_audit --file fixtures/broken.html --base-url https://example.com/ --json
python -m web_audit --file fixtures/good.html --base-url https://example.com/ --json --output reports/good.json
```

`--output` creates a new file without overwriting existing reports. Exit codes:
0 = no findings, 1 = findings, 2 = failed execution or invalid arguments.
The local CLI is a separate single-page workflow; it does not use the hosted
crawler's queue, robots policy or public-address restrictions.

## Verify changes

```bash
python -m pip check
python -m ruff check .
python -m ruff format --check .
python -m pytest -q
cd frontend
npm ci
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Backend tests use fixtures and fake network responses. Browser tests exercise the
dashboard with controlled API responses. GitHub Actions runs backend checks on
Python 3.11/3.12, then frontend type checking, production build and browser tests.

## Deployment and remaining scope

See [the deployment guide](docs/DEPLOYMENT.md) for Docker, Render/Vercel setup,
configuration, backups and a release smoke test. Deployment files are supplied;
a public deployment and live-host verification still require hosting access.

This scanner reads server HTML without executing JavaScript. It does not measure
browser performance, verify every image or link target, or certify SEO,
accessibility or regulatory compliance. Robots restrictions, cross-origin redirects
(including HTTP-to-HTTPS or www changes), unsupported encodings and compressed
responses can prevent a scan. Submit the final canonical URL. Only HTTP/HTTPS on
ports 80/443 is supported. More traffic requires revisiting the single-process
worker, database and admission policy before scaling.
