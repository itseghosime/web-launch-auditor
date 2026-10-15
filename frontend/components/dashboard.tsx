"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpRight, Check, ChevronRight, Globe, History, Loader2, Radar, RefreshCw, Search, Trash2, X } from "lucide-react";

type Finding = { rule: string; category: string; severity: "warning" | "review"; message: string; evidence: unknown; recommendation?: string };
type Page = { source: string; page_url: string; status_code: number | null; findings: Finding[]; error?: string };
type Scan = { id: string; url: string; status: "queued" | "running" | "completed" | "failed"; created_at: string; updated_at: string; max_pages: number; max_depth: number; pages_scanned: number; findings_count: number; error?: string; pages?: Page[]; stop_reason?: string };

const active = (s: Scan) => s.status === "queued" || s.status === "running";
const host = (url: string) => { try { return new URL(url).hostname; } catch { return url; } };
const safeLink = (url: string) => /^https?:\/\//i.test(url) ? url : undefined;
const date = (value: string) => new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

async function api<T>(path: string, options?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  const { signal, ...init } = options ?? {};
  const response = await fetch(`/api/${path}`, { ...init, signal, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.detail === "string" ? error.detail : error.detail?.[0]?.msg || "Something went wrong. Please try again.");
  }
  return response.status === 204 ? undefined as T : response.json();
}

export default function Dashboard() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [selected, setSelected] = useState<Scan | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(5);
  const [maxDepth, setMaxDepth] = useState(1);
  const [severity, setSeverity] = useState("all");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const selectedId = useRef<string | null>(null);
  const detailSequence = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const hasActive = scans.some(active);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const result = await api<{ items: Scan[] }>("scans", { signal });
    setScans(result.items);
    setReady(true);
  }, []);

  const openScan = useCallback(async (scan: Scan) => {
    selectedId.current = scan.id;
    const sequence = ++detailSequence.current;
    setSelected(scan);
    setDetailLoading(true);
    setSeverity("all");
    setCategory("all");
    setError("");
    try {
      const detail = await api<Scan>(`scans/${scan.id}`);
      if (sequence === detailSequence.current) setSelected(detail);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (sequence === detailSequence.current) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    refresh(controller.signal).catch(e => { if (e.name !== "AbortError") setError(e.message); }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!hasActive) return;
    let stopped = false;
    const timer = setInterval(() => {
      if (stopped) return;
      void (async () => {
        try {
          await refresh();
          const id = selectedId.current;
          if (id) {
            const sequence = detailSequence.current;
            const detail = await api<Scan>(`scans/${id}`);
            if (sequence === detailSequence.current && selectedId.current === id) setSelected(detail);
          }
          setError("");
        } catch (e) { if (!stopped) setError((e as Error).message); }
      })();
    }, 2500);
    return () => { stopped = true; clearInterval(timer); };
  }, [hasActive, refresh]);

  async function submit(event?: React.FormEvent, retry?: Scan) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const scan = await api<Scan>("scans", { method: "POST", body: JSON.stringify({ url: retry?.url ?? url.trim(), max_pages: retry?.max_pages ?? maxPages, max_depth: retry?.max_depth ?? maxDepth }) });
      setScans(current => [scan, ...current]);
      selectedId.current = scan.id;
      setSelected(scan);
      detailSequence.current++;
      setSeverity("all");
      setCategory("all");
      await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function remove(scan: Scan) {
    if (!window.confirm(`Delete the saved scan for ${host(scan.url)}?`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`scans/${scan.id}`, { method: "DELETE" });
      setScans(current => current.filter(s => s.id !== scan.id));
      selectedId.current = null;
      detailSequence.current++;
      setSelected(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const findings = (selected?.pages ?? []).flatMap(page => page.findings.map(finding => ({ ...finding, page: page.page_url || page.source })));
  const filtered = findings.filter(f => (severity === "all" || f.severity === severity) && (category === "all" || f.category === category));
  const categories = Array.from(new Set(findings.map(f => f.category))).sort();
  const warnings = findings.filter(f => f.severity === "warning").length;
  const shownScans = scans.filter(scan => scan.url.toLowerCase().includes(query.toLowerCase()));
  const finished = scans.filter(s => s.status === "completed").length;
  const totalFindings = scans.reduce((total, s) => total + s.findings_count, 0);
  const pageErrors = (selected?.pages ?? []).filter(p => p.error);

  return <div className="app">
    <a href="#main" className="skip-link">Skip to content</a>
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Web Launch Auditor home">
        <span className="brand-mark"><Radar size={16} strokeWidth={2.4} aria-hidden="true" /></span>
        <span className="brand-name">Launch Auditor</span>
      </a>
      <nav className="nav" aria-label="Sections">
        <a className="nav-item" href="#new-scan"><Globe size={15} aria-hidden="true" /> New scan</a>
        <a className="nav-item" href="#scan-history"><History size={15} aria-hidden="true" /> History <span className="nav-count">{scans.length}</span></a>
      </nav>
      <div className="sidebar-foot">
        <dl className="limits">
          <div><dt>Pages</dt><dd>20 max</dd></div>
          <div><dt>Depth</dt><dd>3 levels</dd></div>
          <div><dt>Scope</dt><dd>Same site</dd></div>
        </dl>
        <p>robots.txt respected</p>
      </div>
    </aside>
    <div className="content">
      <main id="main">
        <header className="page-head">
          <h1>Site audit</h1>
          <p>Check a public site before launch — metadata, document structure, accessibility signals and internal link coverage.</p>
        </header>

        <section className="panel" id="new-scan" aria-labelledby="new-scan-heading">
          <div className="panel-head">
            <h2 id="new-scan-heading">New scan</h2>
            <p>One URL per scan. The crawler stays on the same origin and follows links up to the depth you choose.</p>
          </div>
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="website">Website URL</label>
              <div className="url-row">
                <div className="url-input">
                  <Globe size={15} aria-hidden="true" />
                  <input ref={input} id="website" type="url" placeholder="https://example.com" value={url} onChange={e => setUrl(e.target.value)} required maxLength={2048} autoComplete="url" spellCheck={false} />
                </div>
                <label className="select-field" htmlFor="max-pages">Pages
                  <select id="max-pages" value={maxPages} onChange={e => setMaxPages(Number(e.target.value))}>
                    {[1, 5, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="select-field" htmlFor="max-depth">Depth
                  <select id="max-depth" value={maxDepth} onChange={e => setMaxDepth(Number(e.target.value))}>
                    {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n === 0 ? "Starting page" : `${n} level${n === 1 ? "" : "s"}`}</option>)}
                  </select>
                </label>
                <button className="button primary" disabled={busy || !ready} type="submit">
                  {busy ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}
                  {busy ? "Starting…" : "Scan website"}
                </button>
              </div>
            </div>
          </form>
        </section>

        {error && <div className="alert" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
          <button className="text-button" onClick={() => { if (selected) void openScan(selected); else void refresh().catch(() => {}); }}>Try again</button>
          <button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><X size={15} aria-hidden="true" /></button>
        </div>}

        <div className="stats">
          <div><span className="stat-label">Scans</span><strong>{scans.length}</strong></div>
          <div><span className="stat-label">Completed</span><strong>{finished}</strong></div>
          <div><span className="stat-label">Findings</span><strong>{totalFindings}</strong></div>
        </div>

        {selected && <section className="panel report" aria-labelledby="report-heading">
          <header className="report-head">
            <div className="report-title">
              <h2 id="report-heading">{host(selected.url)}</h2>
              <a className="report-url" href={safeLink(selected.url)} target="_blank" rel="noreferrer">{selected.url}<ArrowUpRight size={12} aria-hidden="true" /></a>
            </div>
            <div className="report-actions">
              <Status status={selected.status} />
              <button className="button ghost icon" title="Close report" aria-label="Close report" onClick={() => { selectedId.current = null; detailSequence.current++; setSelected(null); }}><X size={15} aria-hidden="true" /></button>
            </div>
          </header>
          {active(selected) ? <div className="progress" role="status">
            <Loader2 size={17} className="spin" aria-hidden="true" />
            <div>
              <strong>Scan in progress</strong>
              <p>{selected.pages_scanned} of up to {selected.max_pages} pages checked. This view updates automatically.</p>
            </div>
          </div> : <>
            {selected.error && <div className="notice error"><AlertTriangle size={15} aria-hidden="true" /><p>{selected.error}</p></div>}
            <div className="report-summary">
              <div><strong>{selected.pages_scanned}</strong><span>pages checked</span></div>
              <div><strong>{warnings}</strong><span>warnings</span></div>
              <div><strong>{findings.length - warnings}</strong><span>to review</span></div>
              <div className="report-buttons">
                <button className="button" disabled={busy} onClick={() => void submit(undefined, selected)}><RefreshCw size={14} aria-hidden="true" /> Run again</button>
                <a className="button" href={`/api/scans/${selected.id}/export`} download><ArrowDownToLine size={14} aria-hidden="true" /> Export JSON</a>
                <button className="button ghost icon danger" aria-label="Delete scan" disabled={busy} onClick={() => void remove(selected)}><Trash2 size={15} aria-hidden="true" /></button>
              </div>
            </div>
            {detailLoading ? <div className="loading" role="status"><Loader2 size={16} className="spin" aria-hidden="true" /> Loading findings…</div> : <>
              {selected.stop_reason && <p className="scan-note">Crawl ended: {selected.stop_reason.replaceAll("_", " ")}. Coverage is limited to the pages checked.</p>}
              {pageErrors.map((p, i) => <div className="notice error" key={i}><AlertTriangle size={15} aria-hidden="true" /><div><code className="error-url">{p.page_url || p.source}</code><p>{p.error}</p></div></div>)}
              <div className="findings">
                <div className="findings-head">
                  <h3>Findings <span>{findings.length}</span></h3>
                  <div className="filters">
                    <label className="sr-only" htmlFor="severity">Filter by severity</label>
                    <select id="severity" value={severity} onChange={e => setSeverity(e.target.value)}>
                      <option value="all">All severities</option>
                      <option value="warning">Warnings</option>
                      <option value="review">To review</option>
                    </select>
                    <label className="sr-only" htmlFor="category">Filter by category</label>
                    <select id="category" value={category} onChange={e => setCategory(e.target.value)}>
                      <option value="all">All categories</option>
                      {categories.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                {filtered.length ? <ul className="finding-list">{filtered.map((f, i) => <li key={`${f.page}-${f.rule}-${i}`}>
                  <details className="finding">
                    <summary>
                      <span className={`severity-dot ${f.severity}`} aria-hidden="true" />
                      <span className="finding-message">{f.message}</span>
                      <span className="finding-category">{f.category}</span>
                      <code className="finding-page">{f.page}</code>
                      <ChevronRight size={15} className="chevron" aria-hidden="true" />
                    </summary>
                    <div className="finding-detail">
                      <div>
                        <span className="detail-label">Recommended action</span>
                        <p>{f.recommendation || "Review this finding on the affected page and update the relevant content or configuration."}</p>
                      </div>
                      <div>
                        <span className="detail-label">Evidence · {f.rule}</span>
                        <pre>{typeof f.evidence === "string" ? f.evidence : JSON.stringify(f.evidence, null, 2)}</pre>
                      </div>
                      <a className="detail-link" href={safeLink(f.page)} target="_blank" rel="noreferrer">Open affected page <ArrowUpRight size={12} aria-hidden="true" /></a>
                    </div>
                  </details>
                </li>)}</ul> : <div className="empty-inline">
                  <p className="empty-title">{findings.length ? "No findings match these filters" : selected.status === "failed" ? "No findings available" : "No findings on the pages checked"}</p>
                  <p>{findings.length ? "Try a different severity or category." : "Automated checks are one part of a thorough launch review."}</p>
                </div>}
              </div>
            </>}
          </>}
        </section>}

        <section className="panel history" id="scan-history" aria-labelledby="history-heading">
          <div className="panel-head history-head">
            <div>
              <h2 id="history-heading">Scan history <span>{scans.length}</span></h2>
              <p>Saved to this browser session only.</p>
            </div>
            <div className="search-box">
              <Search size={14} aria-hidden="true" />
              <input aria-label="Search scans" placeholder="Search by website…" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
          </div>
          {loading ? <div className="loading" role="status"><Loader2 size={16} className="spin" aria-hidden="true" /> Loading history…</div> : scans.length === 0 ? <div className="empty-state">
            <h3>No scans yet</h3>
            <p>Enter a URL above to check a site. Results are saved to this browser session.</p>
            <button className="button" disabled={!ready} onClick={() => { input.current?.focus(); input.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><Globe size={14} aria-hidden="true" /> Start a scan</button>
          </div> : <div className="scan-table">
            <div className="table-head" aria-hidden="true">
              <span>Website</span><span>Status</span><span>Pages</span><span>Findings</span><span>Scanned</span><span />
            </div>
            {shownScans.length ? shownScans.map(scan => <button key={scan.id} className={`scan-row ${selected?.id === scan.id ? "selected" : ""}`} onClick={() => void openScan(scan)}>
              <span className="website-cell"><strong>{host(scan.url)}</strong><small>{scan.url}</small></span>
              <Status status={scan.status} />
              <span className="numeric-cell">{scan.pages_scanned}<small> / {scan.max_pages}</small></span>
              <span className="numeric-cell">{scan.findings_count > 0 ? <span className="finding-count">{scan.findings_count}</span> : "—"}</span>
              <time dateTime={scan.created_at}>{date(scan.created_at)}</time>
              <ChevronRight size={15} className="row-chevron" aria-hidden="true" />
            </button>) : <div className="empty-inline">
              <p className="empty-title">No matching websites</p>
              <p>Try another search.</p>
            </div>}
          </div>}
        </section>

        <footer className="page-foot">
          <p>Automated checks on server-rendered HTML. Review findings before you launch.</p>
          <p>History is anonymous and stays in this browser.</p>
        </footer>
      </main>
    </div>
  </div>;
}

function Status({ status }: { status: Scan["status"] }) {
  const label = status === "completed" ? "Completed" : status === "running" ? "Scanning" : status === "queued" ? "Queued" : "Failed";
  return <span className={`status ${status}`}>
    {status === "queued" || status === "running" ? <Loader2 size={12} className="spin" aria-hidden="true" /> : status === "completed" ? <Check size={12} aria-hidden="true" /> : <AlertTriangle size={12} aria-hidden="true" />}
    {label}
  </span>;
}
