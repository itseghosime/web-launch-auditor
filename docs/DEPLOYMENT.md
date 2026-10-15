# Deployment

The repository contains deployable frontend/backend services. Hosting accounts,
public URLs and a live production smoke test must still be supplied. Use one
backend instance and one Uvicorn worker: startup requeues interrupted jobs and
SQLite is local to that instance.

## Configuration

| Variable | Service | Setting |
| --- | --- | --- |
| `AUDITOR_DB_PATH` | Backend | Persistent database path; default `data/scans.sqlite3` |
| `AUDITOR_API_KEY` | Both | Same randomly generated secret; required when exposing the backend publicly |
| `AUDITOR_COOKIE_SECURE` | Backend | `true` for HTTPS dashboards; `false` for local HTTP |
| `AUDITOR_API_URL` | Frontend | Backend origin without `/api`, e.g. `https://your-backend.onrender.com` |

The API key is server-only. Never use a `NEXT_PUBLIC_` prefix or commit `.env`
files. Generate a key with `python -c 'import secrets; print(secrets.token_hex(32))'`.
The frontend proxies cookies and results; no cross-origin browser API setup is
needed. Store the same API key in both hosting dashboards before exposing traffic.

## Docker Compose

From the repository root, copy `.env.example` to `.env`, configure it, and run
`docker compose up --build -d`. Open <http://localhost:3000>. Backend requests stay
on the Compose network. The named `scans` volume stores `/data/scans.sqlite3`.
The Dockerfiles run as unprivileged users; a custom bind mount must be writable
by backend UID 10001. Both images build from the repository root context.

For a public server, put an HTTPS reverse proxy in front of localhost:3000, preserve
the public Host/Origin, and set `AUDITOR_COOKIE_SECURE=true`. Keep port 8000 private.
Use `docker compose logs -f` to diagnose startup or scan failures. Stop with
`docker compose down`; adding `--volumes` would erase history.

## Render backend

1. Create a Python web service from this repository, with the repository root as
   its root directory and Python 3.12 selected through the platform configuration.
2. Set the build command to `pip install -r requirements.txt` and the start command
   to `uvicorn web_audit.api:app --host 0.0.0.0 --port $PORT --workers 1`.
3. Attach a persistent disk at `/var/data`. Set
   `AUDITOR_DB_PATH=/var/data/scans.sqlite3`, `AUDITOR_COOKIE_SECURE=true`, and a
   strong `AUDITOR_API_KEY`. Configure the health check as `/health`.
4. Deploy one instance. Confirm its HTTPS `/health` returns `{"status":"ok"}`.
   Record the backend origin for the frontend configuration.

Persistent disks require a paid Render service. Only files below the mount path
persist across redeployments; an ordinary ephemeral filesystem loses scans.
Disk-backed services cannot scale to multiple instances and redeployments involve
a brief interruption. See [Render persistent disk documentation](https://render.com/docs/disks).

## Vercel frontend

1. Import the repository and choose `frontend` as the root directory, Next.js as
   the framework, and Node.js 22. Keep its standard install/build settings.
2. Set `AUDITOR_API_URL` to the Render HTTPS origin and `AUDITOR_API_KEY` to the
   exact backend secret. These variables are consumed by server-side API routes.
3. Deploy, open the HTTPS dashboard, and run the smoke test below. If using preview
   deployments, explicitly configure their environment variables too.

Vercel supports Next.js deployments; this app keeps long-running scanning on the
backend and polls for results. See [Vercel's Next.js documentation](https://vercel.com/docs/frameworks/full-stack/nextjs).

## Release smoke test

- Run the repository checks listed in the README and inspect GitHub Actions.
- Submit the final HTTPS URL of a public website you control with a two-page
  limit; watch queued/running state become completed or a readable error.
- Review findings, reload the dashboard, reopen the saved scan and export JSON.
- Open a private browser window: the original history should be absent.
- Confirm a localhost/private-IP submission is rejected and an invalid URL shows
  validation feedback. Confirm the public backend rejects API calls without its key.
- Restart the backend, confirm saved history remains, then delete the test scan.
- Check narrow-screen navigation, keyboard focus and a failed-backend error state.

Record the tested commit, frontend/backend URLs and any failures before calling
the deployment launched. Local tests cannot establish that hosted networking,
HTTPS cookies and persistent storage are configured correctly.

## Operations

The global limit is 30 admitted scans per 10 minutes, with 20 outstanding globally
and 3 per anonymous session. HTTP 429 is expected under load. Only the latest
roughly 500 scan records are retained globally; export important results. Cookies
are the only ownership credential: clearing them loses access to prior history.

Monitor worker errors, disk space and `/health`; health indicates API availability,
not successful access to every target website. Keep regular SQLite-consistent
backups using SQLite's backup API, store copies outside the service disk, and test
restores. Do not copy only a live database file while WAL writes are in progress.
Stop the backend before replacing its database during restore.

The crawler obeys robots.txt, allows only public destinations, pins vetted DNS
addresses, limits response size/time/pages, and rejects cross-origin redirects.
It requests identity encoding and rejects compressed responses. JavaScript-only
pages and sites requiring cookies or login will not produce a complete audit.
