# Launch Auditor: localhost bridge + viral feature roadmap

## Context

Launch Auditor is a pre-launch site auditor: FastAPI backend (`web_audit/`) with a bounded same-origin crawler, SQLite queue, session-cookie history; Next.js Wind Tunnel frontend (`frontend/components/dashboard.tsx`) proxied through `app/api/[...path]/route.ts`. Deploy story is Render backend + Vercel frontend (`docs/DEPLOYMENT.md`). Two gaps block growth: (1) a hosted backend cannot reach a user's `localhost` (rejected in `safe_fetch.py` public-URL validation), and (2) the product lacks shareable, viral surfaces. This roadmap covers all 9 requested items in phased milestones.

Key facts constraining the design (verified against the tree):
- `POST /api/scans` rejects localhost/private IPs and non-80/443 ports (`safe_fetch.py:55-80`, `api.py:65-73`); no `/analyze` endpoint exists.
- Scan records: SQLite `scans(id, owner, url, status, ..., pages TEXT)` (`storage.py:26-32`); session = `auditor_session` cookie (`api.py:108-133`).
- `inspect_html()` emits 18 rules across metadata/structure/accessibility/links/social (`checks.py`).
- Frontend receipt already has `copyFixList()` (`dashboard.tsx:512`), OG preview block (`dashboard.tsx:1365`), flight-recorder drawer (`dashboard.tsx:1829`); proxy allowlists only `scans`, `scans/{id}`, `scans/{id}/export` (`route.ts:7`).
- Python Playwright exists only as optional Tier-3 fallback (`safe_fetch.py:_try_playwright()`), not in `requirements.txt`. No tunnel/extension code exists.

## Milestone v1 — Localhost Bridge (the killer feature)

### 1a. Browser-Relay Bridge (build first, zero-install)
- New endpoint `POST /api/analyze-raw-html` accepting `{url, html, max_pages?, max_depth?}`: validates HTML size (reuse 1 MB bound), runs existing `inspect_html()` + framework/secret scanners over the submitted DOM, stores as a normal scan record with `source: "relay"`. Never fetches the URL server-side (SSRF-safe by construction).
- Frontend: when input matches `localhost|127.0.0.1|[::1]|.local`, switch submit path to `fetch()` the local URL from the browser, POST raw HTML through the Next.js proxy (extend allowlist in `route.ts:7`), render results on the existing Act III stage.
- CORS fallback modal: on `TypeError: Failed to fetch`, show sleek modal with (1) one-line dev-server header fix (Next.js `headers()` / Vite `server.cors` snippet) and (2) copyable tunnel command (see 1b).
- Multi-page relay: crawl same-origin links client-side (fetch + parse in browser, up to `max_pages`), submit each page's HTML. Keeps depth/pages semantics without server network access.
- Tests: `test_api.py` relay cases (oversize HTML rejected, non-HTML rejected, findings round-trip); Playwright test with route-mocked localhost fetch.

### 1b. One-command tunnel fallback (+ companion CLI later)
- Modal offers `npx cloudflared tunnel --url http://localhost:3000` (no install: document `npx` semantics) — user pastes the public URL back into Launch Bay, full Python crawler + Playwright Tier-3 runs unchanged.
- Later (v2): thin `npx launch-auditor <port>` companion that opens a tunnel and deep-links the hosted UI with `?url=<tunnel-url>` prefilled. Roadmap-only; not in v1 build.

### 1c. Chrome extension (parked, v3)
- 20 KB helper to bypass CORS/PNA for one-click local scanning. Plan notes manifest scope, `host_permissions`, and why relay + tunnel cover 95% first. No build in v1/v2.

## Milestone v2 — Viral surfaces

### 2. Copy AI Fix Prompt (Cursor / Claude)
- Upgrade `copyFixList()` (`dashboard.tsx:512`): generate a structured prompt mapping each finding → file/route heuristic (framework-aware, see 6) + exact fix snippet. Button becomes "🤖 Copy AI Fix Prompt". Backend helper `web_audit/ai_prompt.py` builds it from the scan JSON so CLI/export share it; unit-tested against fixture scans.

### 3. Multi-platform social card simulator
- Replace static OG preview (`dashboard.tsx:1365`) with tabs X / WhatsApp / LinkedIn / iMessage rendering pixel-approx mockups from `og:title/description/image` findings. Missing `og:image` → "Naked Link" warning state per platform. Pure frontend; uses existing social rules (`og:*.missing/invalid`).

### 4. Launch-leak & secret scanner
- New checks in `checks.py`: `localhost.leak` (hardcoded `localhost`/127.0.0.1 links), `placeholder.text` (lorem/TODO/default titles), `sourcemap.exposed` (`.js.map` refs), `link.dead_button` (empty `href="#"`, broken `mailto:`). New `secrets` category; severity `warning`. Extend `test_checks.py` fixtures.

### 5. Before/after diff + score delta
- Add deterministic `score` (0–100) computed from findings (`web_audit/scoring.py`: weight by severity×category, stable formula, unit-tested). Flight Recorder drawer gains "compare" affordance: pick two scans of same host → delta badge (`57→98 (+41)`) and node-color replay on the graph. Persist `score` on the scan record (migration: computed column or JSON field).

### 6. Framework detector + stack-specific advice
- Detect Next.js/Vite/Astro/Remix/WordPress/Webflow via `_next/static`, generator meta, headers, build markers. Store `stack` on scan. Recommendation strings become stack-aware (e.g. Next.js App Router → `openGraph.images` in `app/layout.tsx` metadata). Detection in `checks.py` or `web_audit/stack.py`; feeds into feature 2's prompt.

### 7. Shareable Verified Launch Ready report + badge
- Requires hosted store: new `reports(id, scan_snapshot, score, created_at, expires_at)` table + unauthenticated `GET /r/:id` public route rendering a static report page + PNG badge/card endpoint (server-rendered, cacheable). Guardrails: random 128-bit IDs, expiry (e.g. 90 days), rate-limited creation (only from `score ≥ 90` scans), no PII (snapshot strips cookies/owner). Proxy allowlist extended for `/r/*`. Abuse review before launch.

## Milestone v3 — Polish & growth
- Extension build (1c), companion CLI (1b+), report gallery/leaderboard (opt-in), scheduled re-scans with delta alerts.

## Verification (per milestone)
- `python -m pytest -q`, `ruff check`, `ruff format --check`; `cd frontend && npm run typecheck && npm run build && npx playwright test`.
- v1 live test: dev server on `:3000` scanned via relay from hosted-config frontend; CORS-blocked path shows modal; tunnel URL scans end-to-end like `itseghosime.com` did.
- New tests for every backend rule/endpoint; no flaky live-network tests committed (live runs stay manual scripts).

## Risks
- Relay HTML spoofing: treat relayed HTML as untrusted input — size-bound, parse-only, never fetched/executed; score labeled `source: relay`.
- Public reports: unauthenticated route = enumeration/abuse surface → unguessable IDs, expiry, creation rate limits, snapshot-only (no live re-scan via public URL).
- Extension store review overhead is why it's v3, not v1.
