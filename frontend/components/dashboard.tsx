"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, ChevronRight, CircleHelp, Globe2, Layers3, LoaderCircle, Plus, Radar, RefreshCw, Search, ShieldCheck, Trash2, TriangleAlert, X } from "lucide-react";

type Finding = { rule: string; category: string; severity: "warning" | "review"; message: string; evidence: unknown; recommendation?: string };
type Page = { source: string; page_url: string; status_code: number | null; findings: Finding[]; error?: string };
type Scan = { id: string; url: string; status: "queued" | "running" | "completed" | "failed"; created_at: string; updated_at: string; max_pages: number; max_depth: number; pages_scanned: number; findings_count: number; error?: string; pages?: Page[]; stop_reason?: string };
const active = (s: Scan) => s.status === "queued" || s.status === "running";
const host = (url: string) => { try { return new URL(url).hostname; } catch { return url; } };
const safeLink = (url: string) => /^https?:\/\//i.test(url) ? url : undefined;
const date = (value: string) => new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.detail === "string" ? error.detail : error.detail?.[0]?.msg || "Something went wrong. Please try again.");
  }
  return response.status === 204 ? undefined as T : response.json();
}

export default function Dashboard() {
  const [scans, setScans] = useState<Scan[]>([]), [selected, setSelected] = useState<Scan | null>(null);
  const [ready, setReady] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(""), [url, setUrl] = useState(""), [maxPages, setMaxPages] = useState(5), [maxDepth, setMaxDepth] = useState(1);
  const [severity, setSeverity] = useState("all"), [category, setCategory] = useState("all"), [query, setQuery] = useState("");
  const selectedId = useRef<string | null>(null), detailSequence = useRef(0), input = useRef<HTMLInputElement>(null);
  const hasActive = scans.some(active);
  const refresh = useCallback(async () => {
    const result = await api<{ items: Scan[] }>("scans");
    setScans(result.items); setReady(true);
  }, []);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { await refresh(); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [refresh]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!hasActive) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        await refresh();
        const id = selectedId.current;
        if (id) { const scan = await api<Scan>(`scans/${id}`); if (selectedId.current === id) setSelected(scan); }
        setError("");
      } catch (e) { if (!stopped) setError((e as Error).message); }
    }, 2500);
    return () => { stopped = true; clearInterval(timer); };
  }, [hasActive, refresh]);
  async function openScan(scan: Scan) {
    selectedId.current = scan.id; const sequence = ++detailSequence.current;
    setSelected(scan); setDetailLoading(true); setSeverity("all"); setCategory("all"); setError("");
    try { const detail = await api<Scan>(`scans/${scan.id}`); if (sequence === detailSequence.current) setSelected(detail); }
    catch (e) { setError((e as Error).message); }
    finally { if (sequence === detailSequence.current) setDetailLoading(false); }
  }
  async function submit(event?: React.FormEvent, retry?: Scan) {
    event?.preventDefault(); setBusy(true); setError("");
    try {
      const scan = await api<Scan>("scans", { method: "POST", body: JSON.stringify({ url: retry?.url ?? url.trim(), max_pages: retry?.max_pages ?? maxPages, max_depth: retry?.max_depth ?? maxDepth }) });
      setScans(current => [scan, ...current]); selectedId.current = scan.id; setSelected(scan); setSeverity("all"); setCategory("all");
      await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function remove(scan: Scan) {
    if (!window.confirm(`Delete the saved scan for ${host(scan.url)}?`)) return;
    setBusy(true); setError("");
    try { await api(`scans/${scan.id}`, { method: "DELETE" }); setScans(current => current.filter(s => s.id !== scan.id)); selectedId.current = null; setSelected(null); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const findings = (selected?.pages ?? []).flatMap(page => page.findings.map(finding => ({ ...finding, page: page.page_url || page.source })));
  const filtered = findings.filter(f => (severity === "all" || f.severity === severity) && (category === "all" || f.category === category));
  const categories = Array.from(new Set(findings.map(f => f.category))).sort();
  const warnings = findings.filter(f => f.severity === "warning").length;
  const shownScans = scans.filter(scan => scan.url.toLowerCase().includes(query.toLowerCase()));
  return <div className="shell">
    <a href="#main" className="skip-link">Skip to content</a>
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="Web Launch Auditor home"><span className="brand-symbol"><Radar size={24} /></span><span>web launch<span className="brand-secondary">auditor</span></span></a>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <a className="nav-item current" href="#main"><Layers3 size={18} /> Overview <span className="nav-count">{scans.length}</span></a>
      <a className="nav-item" href="#scan-history"><Globe2 size={18} /> Scan history</a>
      <div className="sidebar-bottom"><div className="sidebar-note"><ShieldCheck size={22} /><strong>A little certainty.<br />Before a big launch.</strong><p>Turn overlooked details into a clear next step.</p></div><span className="workspace-foot"><span className="avatar">W</span> Personal workspace <span className="online-dot" /></span></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><span>Workspace <ChevronRight size={14} /> <strong>Overview</strong></span><a href="#how-it-works"><CircleHelp size={16} /> How it works</a></header>
      <main id="main">
        <div className="page-heading"><div><div className="eyebrow">THE PRE-LAUNCH CHECKPOINT</div><h1>Launch with clarity<span>.</span></h1><p>Find the small things before your visitors do.</p></div><span className="status-pill"><span className="online-dot" /> Your launch workspace</span></div>
        <section className="scan-panel" aria-labelledby="new-scan-heading">
          <div className="section-intro"><span className="section-icon"><Radar size={23} /></span><div><h2 id="new-scan-heading">Start a website scan</h2><p>One URL. A clearer picture of what needs attention.</p></div><span className="step-label">01 / SCAN</span></div>
          <form onSubmit={submit}>
            <label htmlFor="website">Website URL</label>
            <div className="url-row"><div className="url-input"><Globe2 size={19} /><input ref={input} id="website" type="url" placeholder="https://your-website.com" value={url} onChange={e => setUrl(e.target.value)} required maxLength={2048} /></div><button className="primary" disabled={busy || !ready} type="submit">{busy ? <LoaderCircle className="spin" size={18} /> : <Radar size={18} />} {busy ? "Starting scan…" : "Scan website"}<ArrowRight size={17} /></button></div>
            <div className="scan-options"><label htmlFor="max-pages">Page limit <select id="max-pages" value={maxPages} onChange={e => setMaxPages(Number(e.target.value))}>{[1, 5, 10, 20].map(n => <option key={n} value={n}>{n} {n === 1 ? "page" : "pages"}</option>)}</select></label><label htmlFor="max-depth">Link depth <select id="max-depth" value={maxDepth} onChange={e => setMaxDepth(Number(e.target.value))}>{[0, 1, 2, 3].map(n => <option key={n} value={n}>{n === 0 ? "Starting page only" : `${n} ${n === 1 ? "level" : "levels"}`}</option>)}</select></label><span><ShieldCheck size={14} /> Public pages · Same site only</span></div>
          </form>
        </section>
        {error && <div className="alert" role="alert"><TriangleAlert size={19} /><span>{error}</span><button className="text-button" onClick={() => { if (selected) void openScan(selected); else void load(); }}>Try again</button><button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><X size={17} /></button></div>}
        <div className="overview-stats"><div><span className="stat-icon"><Layers3 size={19} /></span><div><span>Total scans</span><strong>{scans.length.toString().padStart(2, "0")}</strong></div></div><div><span className="stat-icon teal"><Check size={19} /></span><div><span>Completed</span><strong>{scans.filter(s => s.status === "completed").length.toString().padStart(2, "0")}</strong></div></div><div><span className="stat-icon amber"><TriangleAlert size={19} /></span><div><span>Findings across scans</span><strong>{scans.reduce((total, s) => total + s.findings_count, 0).toString().padStart(2, "0")}</strong></div></div></div>
        {selected && <section className="results-panel" aria-labelledby="results-heading">
          <div className="results-header"><div><div className="eyebrow">SCAN REPORT</div><h2 id="results-heading">{host(selected.url)}</h2><a className="report-url" href={safeLink(selected.url)} target="_blank" rel="noreferrer">{selected.url}<ArrowUpRight size={13} /></a></div><div className="report-actions"><Status status={selected.status} /><button className="icon-button" title="Close report" aria-label="Close report" onClick={() => { selectedId.current = null; detailSequence.current++; setSelected(null); }}><X size={18} /></button></div></div>
          {active(selected) ? <div className="progress-area" role="status"><LoaderCircle className="spin" size={21} /><div><strong>{selected.status === "queued" ? "Your scan is in the queue" : "Checking your website…"}</strong><p>{selected.pages_scanned} of up to {selected.max_pages} pages checked. Results update automatically.</p></div><div className="progress-track"><span style={{ width: `${Math.max(8, selected.pages_scanned / selected.max_pages * 100)}%` }} /></div></div> : <>
            {selected.error && <div className="report-error"><TriangleAlert size={18} /><p>{selected.error}</p></div>}
            <div className="report-summary"><div><strong>{selected.pages_scanned}</strong><span>Pages checked</span></div><div><strong>{warnings}</strong><span>Warnings</span></div><div><strong>{findings.length - warnings}</strong><span>To review</span></div><div className="report-summary-actions"><button className="secondary" disabled={busy} onClick={() => void submit(undefined, selected)}><RefreshCw size={15} /> Run again</button><a className="secondary" href={`/api/scans/${selected.id}/export`} download><ArrowDownToLine size={15} /> Export JSON</a><button className="icon-button delete" aria-label="Delete scan" disabled={busy} onClick={() => void remove(selected)}><Trash2 size={17} /></button></div></div>
            {detailLoading ? <div className="loading-state" role="status"><LoaderCircle className="spin" size={20} /> Loading findings…</div> : <>
              {selected.stop_reason && <p className="scan-note">Crawl ended: {selected.stop_reason.replaceAll("_", " ")}. Coverage is limited to the pages checked.</p>}
              {(selected.pages ?? []).filter(p => p.error).map((p, i) => <div className="page-error" key={i}><TriangleAlert size={16} /><div><strong>{p.page_url || p.source}</strong><p>{p.error}</p></div></div>)}
              <div className="findings-toolbar"><h3>Findings <span>{findings.length}</span></h3><div><label className="sr-only" htmlFor="severity">Filter by severity</label><select id="severity" value={severity} onChange={e => setSeverity(e.target.value)}><option value="all">All severities</option><option value="warning">Warnings</option><option value="review">To review</option></select><label className="sr-only" htmlFor="category">Filter by category</label><select id="category" value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select></div></div>
              {filtered.length ? <div className="finding-list">{filtered.map((f, i) => <details className="finding" key={`${f.page}-${f.rule}-${i}`}><summary><span className={`severity-dot ${f.severity}`} /><div><strong>{f.message}</strong><span>{f.category} <b>·</b> {f.page}</span></div><span className={`severity-badge ${f.severity}`}>{f.severity === "warning" ? "Warning" : "Review"}</span><ChevronRight size={17} /></summary><div className="finding-detail"><div><span className="eyebrow">RECOMMENDED ACTION</span><p>{f.recommendation || "Review this finding on the affected page and update the relevant content or configuration."}</p></div><div><span className="eyebrow">EVIDENCE · {f.rule}</span><pre>{typeof f.evidence === "string" ? f.evidence : JSON.stringify(f.evidence, null, 2)}</pre></div><a href={safeLink(f.page)} target="_blank" rel="noreferrer">Open affected page <ArrowUpRight size={14} /></a></div></details>)}</div> : <div className="compact-empty"><ShieldCheck size={25} /><strong>{findings.length ? "No findings match these filters" : selected.status === "failed" ? "No findings available" : "No findings on the pages checked"}</strong><p>{findings.length ? "Try a different severity or category." : "Automated checks are one part of a thorough launch review."}</p></div>}
            </>}
          </>}
        </section>}
        <section id="scan-history" className="history-section" aria-labelledby="history-heading"><div className="history-heading"><div><h2 id="history-heading">Your scans <span>{scans.length}</span></h2><p>A record of every check, ready when you need it.</p></div><div className="search-box"><Search size={16} /><input aria-label="Search scans" placeholder="Search by website…" value={query} onChange={e => setQuery(e.target.value)} /></div></div>
          {loading ? <div className="empty-state" role="status"><LoaderCircle className="spin" size={28} /><h3>Loading your workspace…</h3></div> : scans.length === 0 ? <div className="empty-state"><div className="empty-illustration"><Globe2 size={39} /><span><Check size={17} /></span></div><h3>Your first launch check starts here</h3><p>Add a website above to check its metadata, links,<br className="desktop-only" /> accessibility signals, and more.</p><button className="secondary" disabled={!ready} onClick={() => { input.current?.focus(); input.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><Plus size={16} /> Start your first scan</button></div> : <div className="scan-table"><div className="table-head"><span>WEBSITE</span><span>STATUS</span><span>PAGES</span><span>FINDINGS</span><span>SCANNED</span><span /></div>{shownScans.length ? shownScans.map(scan => <button key={scan.id} className={`scan-row ${selected?.id === scan.id ? "selected" : ""}`} onClick={() => void openScan(scan)}><span className="website-cell"><span className="site-icon"><Globe2 size={17} /></span><span><strong>{host(scan.url)}</strong><small>{scan.url}</small></span></span><Status status={scan.status} /><span className="numeric-cell">{scan.pages_scanned}<small> / {scan.max_pages}</small></span><span className="numeric-cell">{scan.findings_count > 0 ? <span className="finding-count">{scan.findings_count}</span> : "—"}</span><time dateTime={scan.created_at}>{date(scan.created_at)}</time><ArrowUpRight size={17} /></button>) : <div className="compact-empty"><Search size={23} /><strong>No matching websites</strong><p>Try another search.</p></div>}</div>}
        </section>
        <section className="how-it-works" id="how-it-works"><div><span className="eyebrow">A BETTER LAUNCH ROUTINE</span><h2>From URL to next steps.</h2></div><div><span>01</span><strong>Scan your site</strong><p>Choose your starting page and how far to explore.</p></div><div><span>02</span><strong>Review the details</strong><p>See findings with evidence and practical recommendations.</p></div><div><span>03</span><strong>Make it launch-ready</strong><p>Fix what matters, then run another check.</p></div></section>
        <footer><span>WEB LAUNCH AUDITOR</span><p>Automated checks. Human judgment. Better launches.</p><span>Built for the final mile <ArrowUpRight size={12} /></span></footer>
      </main>
    </div>
  </div>;
}
function Status({ status }: { status: Scan["status"] }) { return <span className={`scan-status ${status}`}>{status === "running" || status === "queued" ? <LoaderCircle size={12} className="spin" /> : status === "completed" ? <Check size={12} /> : <TriangleAlert size={12} />}{status === "completed" ? "Completed" : status === "running" ? "Scanning" : status === "queued" ? "Queued" : "Failed"}</span>; }
