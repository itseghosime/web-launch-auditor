"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  AlertTriangle, ArrowDownToLine, ArrowUpRight, Check, ChevronRight, Copy, FileSearch, FlaskConical,
  Globe, History, Layers, Link2, Loader2, Radar, RefreshCw, Search, ShieldCheck, Sparkles,
  Terminal, Trash2, X, Zap, Eye, Brain, Flame, Target, Beaker, Dices,
} from "lucide-react";

type Finding = { rule: string; category: string; severity: "warning" | "review"; message: string; evidence: unknown; recommendation?: string };
type Page = { source: string; page_url: string; status_code: number | null; findings: Finding[]; error?: string };
type Scan = { id: string; url: string; status: "queued" | "running" | "completed" | "failed"; created_at: string; updated_at: string; max_pages: number; max_depth: number; pages_scanned: number; findings_count: number; error?: string; pages?: Page[]; stop_reason?: string };
type Vibe = "gentle" | "strict" | "roast";

const active = (s: Scan) => s.status === "queued" || s.status === "running";
const hostOf = (url: string) => { try { return new URL(url).hostname; } catch { return url; } };
const safeLink = (url: string) => /^https?:\/\//i.test(url) ? url : undefined;
const dateFmt = (v: string) => new Date(v).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const faviconUrl = (url: string) => { try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`; } catch { return ""; } };
const isValidUrl = (v: string) => { try { const u = new URL(v); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; } };

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.detail === "string" ? error.detail : error.detail?.[0]?.msg || "Something went wrong. Please try again.");
  }
  return response.status === 204 ? undefined as T : response.json();
}

// ── vibe log lines ──
const vibeLines: Record<Vibe, { start: string; page: (url: string) => string; warn: (msg: string) => string; done: string; fail: string }> = {
  gentle: {
    start: "Warming up the crawler — let's take a look around…",
    page: (u) => `Checking ${u} — looks good so far!`,
    warn: (m) => `Heads up: ${m}`,
    done: "All done — nice work on this site!",
    fail: "Couldn't reach that page — might be worth a quick check.",
  },
  strict: {
    start: "Initiating strict QA sweep. Every byte will be inspected.",
    page: (u) => `AUDIT → ${u} [200] — dissecting DOM…`,
    warn: (m) => `⚠ VIOLATION: ${m}`,
    done: "Sweep complete. Review findings before sign-off.",
    fail: "CONNECTION REFUSED — host unreachable or blocked.",
  },
  roast: {
    start: "Buckle up — we're about to roast this site properly…",
    page: (u) => `Peeking at ${u} — hope your og:image isn't just vibes…`,
    warn: (m) => `Yikes — ${m} (your link preview will look naked on X)`,
    done: "Roast complete. Go fix that stuff before the internet sees it.",
    fail: "Bounced at the door — bot protection or the site just ghosted us.",
  },
};

export default function Dashboard() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [selected, setSelected] = useState<Scan | null>(null);
  const [drawerScan, setDrawerScan] = useState<Scan | null>(null);
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
  const [vibe, setVibe] = useState<Vibe>("gentle");
  const [inspectors, setInspectors] = useState({ meta: true, links: true, dom: true, a11y: true });
  const [simActive, setSimActive] = useState(false);
  const [copyOk, setCopyOk] = useState(false);
  const selectedId = useRef<string | null>(null);
  const detailSequence = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasActive = scans.some(active) || simActive;

  // persist vibe
  useEffect(() => { try { const v = localStorage.getItem("la-vibe") as Vibe | null; if (v && ["gentle","strict","roast"].includes(v)) setVibe(v); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("la-vibe", vibe); } catch {} }, [vibe]);

  const refresh = useCallback(async () => {
    const result = await api<{ items: Scan[] }>("scans");
    setScans(result.items);
    setReady(true);
  }, []);

  const openScan = useCallback(async (scan: Scan) => {
    selectedId.current = scan.id;
    const seq = ++detailSequence.current;
    setSelected(scan);
    setDetailLoading(true);
    setSeverity("all");
    setCategory("all");
    setError("");
    try {
      const detail = await api<Scan>(`scans/${scan.id}`);
      if (seq === detailSequence.current) setSelected(detail);
    } catch (e) { setError((e as Error).message); }
    finally { if (seq === detailSequence.current) setDetailLoading(false); }
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh().catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [refresh]);

  const hasActiveScan = scans.some(active);
  useEffect(() => {
    if (!hasActiveScan) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        await refresh();
        const id = selectedId.current;
        if (id) {
          const seq = detailSequence.current;
          const detail = await api<Scan>(`scans/${id}`);
          if (seq === detailSequence.current && selectedId.current === id) setSelected(detail);
        }
        setError("");
      } catch (e) { if (!stopped) setError((e as Error).message); }
    }, 2500);
    return () => { stopped = true; clearInterval(timer); };
  }, [hasActiveScan, refresh]);

  // keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && ready && !busy && isValidUrl(url.trim())) {
        e.preventDefault();
        void submit();
      }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  async function submit(event?: React.FormEvent, retry?: Scan) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const scan = await api<Scan>("scans", { method: "POST", body: JSON.stringify({ url: retry?.url ?? url.trim(), max_pages: retry?.max_pages ?? maxPages, max_depth: retry?.max_depth ?? maxDepth }) });
      setScans(c => [scan, ...c]);
      selectedId.current = scan.id;
      setSelected(scan);
      detailSequence.current++;
      setSeverity("all");
      setCategory("all");
      await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function remove(scan: Scan) {
    if (!window.confirm(`Delete the saved scan for ${hostOf(scan.url)}?`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`scans/${scan.id}`, { method: "DELETE" });
      setScans(c => c.filter(s => s.id !== scan.id));
      selectedId.current = null;
      detailSequence.current++;
      setSelected(null);
      setDrawerScan(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  function handleSimulate() {
    setSimActive(true);
    setTimeout(() => setSimActive(false), 6000);
  }

  async function copyFixList(scan: Scan) {
    const findings = (scan.pages ?? []).flatMap(p => p.findings.map(f => `- [ ] **${f.message}** (${f.category}) — ${p.page_url || p.source}\n  > ${f.recommendation || ""}`));
    const md = `# Fix list — ${scan.url}\n\n${findings.join("\n") || "_No findings — ship it!_"}\n`;
    try { await navigator.clipboard.writeText(md); setCopyOk(true); setTimeout(() => setCopyOk(false), 1800); } catch {}
  }

  const findings = (selected?.pages ?? []).flatMap(p => p.findings.map(f => ({ ...f, page: p.page_url || p.source })));
  const filtered = findings.filter(f => (severity === "all" || f.severity === severity) && (category === "all" || f.category === category));
  const categories = Array.from(new Set(findings.map(f => f.category))).sort();
  const warnings = findings.filter(f => f.severity === "warning").length;
  const shownScans = scans.filter(s => s.url.toLowerCase().includes(query.toLowerCase()));
  const finished = scans.filter(s => s.status === "completed").length;
  const totalFindings = scans.reduce((t, s) => t + s.findings_count, 0);
  const pageErrors = (selected?.pages ?? []).filter(p => p.error);
  const activeScan = scans.find(active) || (simActive ? { id: "sim", url: url || "https://example.com", status: "running" as const, pages_scanned: 2, max_pages: maxPages } as Scan : null);

  // derived bento data
  const deadLinks = findings.filter(f => f.rule.includes("link") || f.rule.includes("404") || f.category === "Links").length;
  const ogIssues = findings.filter(f => f.rule.includes("og") || f.rule.includes("social") || f.category === "Social").length;
  const a11yIssues = findings.filter(f => f.category === "Accessibility").length;
  const fleetScore = scans.length === 0 ? 0 : Math.round((finished / scans.length) * 100);
  const scoreColor = fleetScore >= 80 ? "var(--emerald)" : fleetScore >= 50 ? "var(--amber)" : "var(--crimson)";
  const urlValid = isValidUrl(url.trim());
  const dareChips = [
    { label: "Audit itseghosime.com", url: "https://itseghosime.com", icon: Target },
    { label: "Test localhost:3000", url: "http://localhost:3000", icon: Beaker },
    { label: "Scan a sample broken site", url: "https://example.com", icon: Dices },
  ];

  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to content</a>

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-inner">
          <a className="brand" href="/" aria-label="Launch Auditor home">
            <span className="brand-mark">
              <Radar size={18} className={`radar-sweep ${hasActive ? "fast" : ""}`} />
            </span>
            <span className="brand-text">
              <span className="brand-name">Launch Auditor</span>
              <span className="brand-sub">MISSION CONTROL</span>
            </span>
          </a>

          <nav className="nav" aria-label="Sections">
            <a className="nav-item" href="#launch-bay"><Target size={15} /> Launch Bay</a>
            <a className="nav-item" href="#theater"><Eye size={15} /> Theater {hasActive && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--emerald)", boxShadow: "0 0 6px var(--emerald)", marginLeft: "auto" }} />} </a>
            <a className="nav-item" href="#scan-history"><History size={15} /> History <span className="nav-count">{scans.length}</span></a>
          </nav>

          <div className="inspector-section">
            <div className="inspector-label">INSPECTOR LOADOUT</div>
            <div className="inspector-toggles">
              {[
                { key: "meta" as const, icon: Sparkles, title: "Metadata & Social Cards", sub: "OG, Twitter, title", color: "#8b5cf6" },
                { key: "links" as const, icon: Link2, title: "Dead Link Hunter", sub: "404s & redirects", color: "var(--crimson)" },
                { key: "dom" as const, icon: Layers, title: "DOM & Heading Hierarchy", sub: "H1–H6 structure", color: "var(--amber)" },
                { key: "a11y" as const, icon: ShieldCheck, title: "A11y & Alt-Tag Police", sub: "Images, ARIA", color: "var(--emerald)" },
              ].map(m => (
                <button key={m.key} className={`toggle-row ${inspectors[m.key] ? "" : "off"}`} onClick={() => setInspectors(c => ({ ...c, [m.key]: !c[m.key] }))} type="button">
                  <span className="toggle-icon"><m.icon size={13} /></span>
                  <span className="toggle-text"><strong>{m.title}</strong><span>{m.sub}</span></span>
                  <span className={`pill-switch ${inspectors[m.key] ? "on" : ""}`} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

          <div className="sidebar-foot">
            <div className="spec-plate">
              <div className="spec-plate-head">ENGINE SPEC</div>
              <dl>
                <div className="spec-row"><dt>Pages</dt><dd>20 max</dd></div>
                <div className="spec-row"><dt>Depth</dt><dd>3 levels</dd></div>
                <div className="spec-row"><dt>Scope</dt><dd>Same site</dd></div>
              </dl>
            </div>
            <div className="telemetry-badge">
              <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--emerald)", display: "inline-block", flexShrink: 0 }} />
              ROBOTS.TXT RESPECTED · STEALTH HEADERS READY
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="content">
        <main id="main">
          {/* Hero */}
          <header className="hero">
            <div className="hero-text">
              <h1>Pre-Flight <em>Site Telemetry</em></h1>
              <p>Strap your URL into the wind tunnel before the internet finds your broken links.</p>
            </div>
            <LayoutGroup>
              <div className="vibe-switcher" role="group" aria-label="Inspector vibe">
                {([
                  { id: "gentle" as Vibe, label: "Gentle Peer", icon: "🤝" },
                  { id: "strict" as Vibe, label: "Strict QA", icon: "🕵️" },
                  { id: "roast" as Vibe, label: "Roast Mode", icon: "🔥" },
                ]).map(v => (
                  <button key={v.id} className={`vibe-btn ${vibe === v.id ? "active" : ""}`} onClick={() => setVibe(v.id)} type="button">
                    {vibe === v.id && <motion.div layoutId="vibe-bg" className="vibe-active-bg" transition={{ type: "spring", stiffness: 300, damping: 28 }} />}
                    <span style={{ position: "relative", display: "flex", alignItems: "center", gap: 4 }}><span>{v.icon}</span> {v.label}</span>
                  </button>
                ))}
              </div>
            </LayoutGroup>
          </header>

          {/* Launch Bay */}
          <section className="launch-bay" id="launch-bay" aria-labelledby="launch-heading">
            <div className="launch-bay-head">
              <h2 id="launch-heading">Launch Bay</h2>
              <p>One URL per scan · Same-origin crawl · Up to 90s</p>
            </div>
            <form className="launch-form" onSubmit={submit}>
              <div className="url-field">
                <label htmlFor="website">Website URL <kbd>/</kbd> to focus · <kbd>⌘ ↵</kbd> to ignite</label>
                <div className="url-input-wrap">
                  <Globe size={16} style={{ color: "var(--faint)", flexShrink: 0 }} aria-hidden="true" />
                  <input
                    ref={inputRef}
                    id="website"
                    type="url"
                    placeholder="https://example.com"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    required
                    maxLength={2048}
                    autoComplete="url"
                    spellCheck={false}
                  />
                  <AnimatePresence>
                    {urlValid && (
                      <motion.span
                        className="target-lock"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.15 }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={faviconUrl(url)} alt="" onError={e => ((e.target as HTMLImageElement).style.display = "none")} />
                        {hostOf(url)} <span className="target-dot" /> READY
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="dare-chips">
                {dareChips.map(c => (
                  <button key={c.url} type="button" className="dare-chip" onClick={() => setUrl(c.url)}>
                    <c.icon size={12} aria-hidden="true" /> {c.label}
                  </button>
                ))}
              </div>

              <div className="telemetry-row">
                <div className="telemetry-group">
                  <span>PAGES</span>
                  <LayoutGroup>
                    <div className="pages-pills" role="group" aria-label="Pages">
                      {[1, 5, 10, 20].map(n => (
                        <button key={n} type="button" className={`pages-pill ${maxPages === n ? "active" : ""}`} onClick={() => setMaxPages(n)}>
                          {maxPages === n && <motion.div layoutId="pages-bg" className="pages-pill-bg" transition={{ type: "spring", stiffness: 300, damping: 28 }} />}
                          <span style={{ position: "relative" }}>{n}</span>
                        </button>
                      ))}
                    </div>
                  </LayoutGroup>
                </div>

                <div className="depth-control">
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "var(--muted)" }}>DEPTH</span>
                  <LayoutGroup>
                    <div className="depth-rings" role="group" aria-label="Depth">
                      {[1, 2, 3].map(d => {
                        const labels = ["", "Surface Skim", "Deep Dive", "Full Excavation"];
                        return (
                          <button key={d} type="button" className={`depth-ring-btn ${maxDepth >= d ? "" : ""} ${maxDepth === d ? "active" : ""}`} onClick={() => setMaxDepth(d)} title={labels[d]}>
                            {maxDepth === d && <motion.div layoutId="depth-bg" className="depth-ring-bg" transition={{ type: "spring", stiffness: 300, damping: 28 }} />}
                            <span className="ring-viz" style={{ position: "relative" }}>
                              <span className="ring ring-1" style={{ opacity: maxDepth >= 1 ? 1 : 0.25, borderColor: maxDepth >= 1 ? "var(--aero)" : undefined }} />
                              {d >= 2 && <span className="ring ring-2" style={{ position: "absolute", opacity: maxDepth >= 2 ? 1 : 0.18, borderColor: maxDepth >= 2 ? "var(--aero)" : undefined }} />}
                              {d >= 3 && <span className="ring ring-3" style={{ position: "absolute", opacity: maxDepth >= 3 ? 1 : 0.12, borderColor: maxDepth >= 3 ? "var(--aero)" : undefined }} />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </LayoutGroup>
                  <span className="depth-label">{maxDepth === 1 ? "Surface Skim" : maxDepth === 2 ? "Deep Dive" : maxDepth === 3 ? "Full Excavation" : "Starting page"}</span>
                  {/* hidden select for a11y/tests compat */}
                  <select id="max-pages" value={maxPages} onChange={e => setMaxPages(Number(e.target.value))} className="sr-only" tabIndex={-1} aria-hidden="true">
                    {[1, 5, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <select id="max-depth" value={maxDepth} onChange={e => setMaxDepth(Number(e.target.value))} className="sr-only" tabIndex={-1} aria-hidden="true">
                    {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>

                <motion.button
                  className="ignite-btn"
                  disabled={busy || !ready}
                  type="submit"
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {busy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Zap size={16} aria-hidden="true" />}
                  {busy ? "Igniting…" : "Ignite Scan"}
                  <span className="ignite-kbd">⌘ ↵</span>
                </motion.button>
              </div>
            </form>
          </section>

          {error && (
            <motion.div className="alert" role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{error}</span>
              <button className="text-button" onClick={() => { if (selected) void openScan(selected); else void refresh().catch(() => {}); }}>Try again</button>
              <button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><X size={15} aria-hidden="true" /></button>
            </motion.div>
          )}

          {/* ── Theater Stage ── */}
          <section className="theater" id="theater" aria-labelledby="theater-heading">
            <div className="theater-head">
              <h2 id="theater-heading"><span className={`live-dot ${hasActive ? "" : "idle"}`} aria-hidden="true" /> {hasActive ? "Live Crawler Theater" : "Telemetry Stage"}</h2>
              <div className="theater-actions">
                <button className="button" style={{ height: 32, fontSize: 11 }} onClick={handleSimulate} type="button" disabled={simActive}>
                  <FlaskConical size={12} aria-hidden="true" /> {simActive ? "Simulating…" : "Simulate Live Crawl"}
                </button>
                {activeScan && <span className="status running" style={{ height: 32 }}><Loader2 size={11} className="spin" aria-hidden="true" /> Scanning</span>}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {hasActive && (selected || activeScan) ? (
                <motion.div
                  key="active"
                  className="theater-active"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="graph-pane">
                    <div className="graph-pane-head"><span>NODE GRAPH</span><span>{(selected?.pages_scanned ?? activeScan?.pages_scanned ?? 0)} / {selected?.max_pages ?? activeScan?.max_pages ?? maxPages} pages</span></div>
                    <CrawlerGraph scan={selected ?? activeScan} simActive={simActive} />
                  </div>
                  <div className="terminal-pane">
                    <div className="terminal-head"><Terminal size={12} aria-hidden="true" /> LIVE LOG — {vibe.toUpperCase()}</div>
                    <div className="terminal-body">
                      <TerminalStream scan={selected ?? activeScan} vibe={vibe} simActive={simActive} />
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="bento"
                  className="bento"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="bento-card">
                    <h3>FLEET READINESS</h3>
                    <div className="dial-wrap">
                      <svg className="dial-svg" width={96} height={96} viewBox="0 0 96 96">
                        <circle className="dial-track" cx={48} cy={48} r={36} />
                        <motion.circle
                          className="dial-fill"
                          cx={48} cy={48} r={36}
                          stroke={scoreColor}
                          strokeDasharray={2 * Math.PI * 36}
                          strokeDashoffset={2 * Math.PI * 36 * (1 - fleetScore / 100)}
                          initial={{ strokeDashoffset: 2 * Math.PI * 36 }}
                          animate={{ strokeDashoffset: 2 * Math.PI * 36 * (1 - fleetScore / 100) }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                      </svg>
                      <div className="dial-center"><strong style={{ color: scoreColor }}>{fleetScore}%</strong><span>HEALTH</span></div>
                    </div>
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>{finished} of {scans.length} scans passed · {scans.length === 0 ? "No scans yet" : fleetScore >= 80 ? "Fleet is looking sharp" : "Needs attention"}</p>
                  </div>
                  <div className="bento-card">
                    <h3>CRAWL RADAR</h3>
                    <div className="radar-canvas" aria-hidden="true">
                      <div className="radar-grid">
                        {[22, 44, 66, 88].map(r => <div key={r} className="radar-circle" style={{ width: r * 1.15, height: r * 1.15 }} />)}
                        <motion.div className="radar-sweep-line" animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} />
                        {/* sample nodes */}
                        {(selected?.pages ?? []).slice(0, 6).map((p, i) => {
                          const angle = (i / 6) * 360;
                          const dist = 18 + i * 7;
                          return <motion.div key={i} style={{ position: "absolute", width: 6, height: 6, borderRadius: 999, background: p.error ? "var(--crimson)" : p.findings.length ? "var(--amber)" : "var(--emerald)", left: `calc(50% + ${Math.cos((angle * Math.PI) / 180) * dist}px)`, top: `calc(50% + ${Math.sin((angle * Math.PI) / 180) * dist}px)` }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.08, type: "spring", stiffness: 300, damping: 18 }} />;
                        })}
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{selected ? `${selected.pages?.length ?? 0} nodes · ${hostOf(selected.url)}` : "Idle — awaiting next scan"}</p>
                  </div>
                  <div className="bento-card">
                    <h3>CAUGHT IN THE WILD</h3>
                    <div className="caught-pills">
                      <span className="caught-pill dead">🕸️ Dead Links — {deadLinks}</span>
                      <span className="caught-pill og">👻 Missing OG — {ogIssues}</span>
                      <span className="caught-pill a11y">♿ A11y Traps — {a11yIssues}</span>
                    </div>
                    <p style={{ fontSize: 11, color: "var(--muted)" }}>{totalFindings} findings across {scans.length} scans · {findings.length} in selected</p>
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)" }}>Scans {scans.length}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--emerald)", fontWeight: 700 }}>{finished} completed</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--amber)", fontWeight: 700 }}>{totalFindings} findings</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* ── Selected report ── */}
          <AnimatePresence>
            {selected && (
              <motion.section
                className="report"
                aria-labelledby="report-heading"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
              >
                <header className="report-head">
                  <div className="report-title">
                    <h2 id="report-heading">{hostOf(selected.url)}</h2>
                    <a className="report-url" href={safeLink(selected.url)} target="_blank" rel="noreferrer">{selected.url}<ArrowUpRight size={12} aria-hidden="true" /></a>
                  </div>
                  <div className="report-actions">
                    <Status status={selected.status} />
                    <button className="button ghost icon" title="Close report" aria-label="Close report" onClick={() => { selectedId.current = null; detailSequence.current++; setSelected(null); }}><X size={15} aria-hidden="true" /></button>
                  </div>
                </header>
                {active(selected) ? (
                  <div className="progress-banner" role="status">
                    <Loader2 size={18} className="spin" aria-hidden="true" style={{ color: "var(--aero)", flexShrink: 0 }} />
                    <div><strong>Scan in progress</strong><p>{selected.pages_scanned} of up to {selected.max_pages} pages checked. Theater is live.</p></div>
                  </div>
                ) : (
                  <>
                    {selected.error && <div className="notice"><AlertTriangle size={15} aria-hidden="true" /><p>{selected.error}</p></div>}
                    <div className="report-summary">
                      <div><strong>{selected.pages_scanned}</strong><span>pages checked</span></div>
                      <div><strong>{warnings}</strong><span>warnings</span></div>
                      <div><strong>{findings.length - warnings}</strong><span>to review</span></div>
                      <div className="report-buttons">
                        <button className="button" disabled={busy} onClick={() => void submit(undefined, selected)}><RefreshCw size={13} aria-hidden="true" /> Run again</button>
                        <button className="button" onClick={() => setDrawerScan(selected)}><FileSearch size={13} aria-hidden="true" /> Receipt</button>
                        <a className="button" href={`/api/scans/${selected.id}/export`} download><ArrowDownToLine size={13} aria-hidden="true" /> Export JSON</a>
                        <button className="button ghost icon danger" aria-label="Delete scan" disabled={busy} onClick={() => void remove(selected)}><Trash2 size={15} aria-hidden="true" /></button>
                      </div>
                    </div>
                    {detailLoading ? <div className="loading" role="status"><Loader2 size={16} className="spin" aria-hidden="true" /> Loading findings…</div> : (
                      <>
                        {selected.stop_reason && <p className="scan-note">Crawl ended: {selected.stop_reason.replaceAll("_", " ")}. Coverage is limited to the pages checked.</p>}
                        {pageErrors.map((p, i) => <div className="notice" key={i}><AlertTriangle size={15} aria-hidden="true" /><div><code className="error-url">{p.page_url || p.source}</code><p>{p.error}</p></div></div>)}
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
                          {filtered.length ? (
                            <ul className="finding-list">
                              {filtered.map((f, i) => (
                                <li key={`${f.page}-${f.rule}-${i}`}>
                                  <details className="finding">
                                    <summary>
                                      <span className={`severity-dot ${f.severity}`} aria-hidden="true" />
                                      <span className="finding-message">{f.message}</span>
                                      <span className="finding-category">{f.category}</span>
                                      <code className="finding-page">{f.page}</code>
                                      <ChevronRight size={15} className="chevron" aria-hidden="true" />
                                    </summary>
                                    <div className="finding-detail">
                                      <div><span className="detail-label">RECOMMENDED ACTION</span><p>{f.recommendation || "Review this finding on the affected page and update the relevant content or configuration."}</p></div>
                                      <div><span className="detail-label">EVIDENCE · {f.rule}</span><pre>{typeof f.evidence === "string" ? f.evidence : JSON.stringify(f.evidence, null, 2)}</pre></div>
                                      <a className="detail-link" href={safeLink(f.page)} target="_blank" rel="noreferrer">Open affected page <ArrowUpRight size={12} aria-hidden="true" /></a>
                                    </div>
                                  </details>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="empty-inline">
                              <p className="empty-title">{findings.length ? "No findings match these filters" : selected.status === "failed" ? "No findings available" : "No findings on the pages checked"}</p>
                              <p>{findings.length ? "Try a different severity or category." : "Automated checks are one part of a thorough launch review."}</p>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </motion.section>
            )}
          </AnimatePresence>

          {/* ── History ── */}
          <section className="history" id="scan-history" aria-labelledby="history-heading">
            <div className="history-head">
              <div>
                <h2 id="history-heading">Scan history <span>{scans.length}</span></h2>
                <p>Saved to this browser session only · Click a row to inspect</p>
              </div>
              <div className="search-box">
                <Search size={14} aria-hidden="true" />
                <input aria-label="Search scans" placeholder="Search by website…" value={query} onChange={e => setQuery(e.target.value)} />
              </div>
            </div>
            {loading ? <div className="loading" role="status"><Loader2 size={16} className="spin" aria-hidden="true" /> Loading history…</div> : scans.length === 0 ? (
              <div className="empty-state">
                <h3>No scans yet</h3>
                <p>Enter a URL above to check a site. Results are saved to this browser session.</p>
                <button className="button" disabled={!ready} onClick={() => { inputRef.current?.focus(); inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><Target size={14} aria-hidden="true" /> Start a scan</button>
              </div>
            ) : (
              <div>
                <div className="table-head" aria-hidden="true"><span>Website</span><span>Status</span><span>Pages</span><span>Findings</span><span>Scanned</span><span /></div>
                {shownScans.length ? shownScans.map(scan => (
                  <button key={scan.id} className={`scan-row ${selected?.id === scan.id ? "selected" : ""}`} onClick={() => void openScan(scan)}>
                    <span className="website-cell">
                      <span className="favicon" aria-hidden="true">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={faviconUrl(scan.url)} alt="" onError={e => ((e.target as HTMLImageElement).style.display = "none")} />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <strong>{hostOf(scan.url)}</strong>
                        <small>{scan.url}</small>
                        <span className="config-badge">{scan.max_pages}p · d{scan.max_depth}</span>
                        {scan.status === "failed" && <span className="failed-hint">Bounced at the door — SSL, bot protection, or unreachable host</span>}
                      </span>
                    </span>
                    <Status status={scan.status} />
                    <span className="numeric-cell">{scan.pages_scanned}<small> / {scan.max_pages}</small></span>
                    <span className="numeric-cell">{scan.findings_count > 0 ? <span className="finding-count">{scan.findings_count}</span> : "—"}</span>
                    <time dateTime={scan.created_at}>{dateFmt(scan.created_at)}</time>
                    <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      {scan.status === "failed" && (
                        <span
                          role="button"
                          tabIndex={0}
                          className="retry-stealth"
                          onClick={e => { e.stopPropagation(); void submit(undefined, scan); }}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); void submit(undefined, scan); } }}
                        >
                          <Zap size={10} aria-hidden="true" /> Retry
                        </span>
                      )}
                      <ChevronRight size={15} className="row-chevron" aria-hidden="true" />
                    </span>
                  </button>
                )) : (
                  <div className="empty-inline"><p className="empty-title">No matching websites</p><p>Try another search.</p></div>
                )}
              </div>
            )}
          </section>

          <footer className="page-foot">
            <p>Automated checks on server-rendered HTML · Review findings before you launch.</p>
            <p>History is anonymous and stays in this browser.</p>
          </footer>
        </main>
      </div>

      {/* Thermal Receipt Drawer */}
      <AnimatePresence>
        {drawerScan && (
          <>
            <motion.div className="drawer-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawerScan(null)} />
            <motion.div
              className="drawer"
              role="dialog"
              aria-label="Pre-Flight Thermal Receipt"
              initial={{ x: 440 }}
              animate={{ x: 0 }}
              exit={{ x: 440 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
            >
              <div className="drawer-head">
                <h2>THERMAL RECEIPT</h2>
                <button className="icon-button" aria-label="Close receipt" onClick={() => setDrawerScan(null)}><X size={16} /></button>
              </div>
              <div className="drawer-body">
                <div className="receipt-title">✈ PRE-FLIGHT MANIFEST — {hostOf(drawerScan.url).toUpperCase()}</div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <span className={`grade-stamp ${drawerScan.status === "completed" ? (drawerScan.findings_count === 0 ? "passed" : "needs-tape") : "aborted"}`}>
                    {drawerScan.status === "completed" ? (drawerScan.findings_count === 0 ? "PASSED ✓" : "NEEDS DUCT TAPE") : "ABORTED"}
                  </span>
                </div>
                <dl style={{ display: "grid", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><dt style={{ color: "var(--muted)" }}>URL</dt><dd style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{drawerScan.url}</dd></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><dt style={{ color: "var(--muted)" }}>Scanned</dt><dd>{dateFmt(drawerScan.created_at)}</dd></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><dt style={{ color: "var(--muted)" }}>Inspector Vibe</dt><dd>{vibe}</dd></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><dt style={{ color: "var(--muted)" }}>Pages</dt><dd>{drawerScan.pages_scanned} / {drawerScan.max_pages}</dd></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><dt style={{ color: "var(--muted)" }}>Depth</dt><dd>{drawerScan.max_depth}</dd></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><dt style={{ color: "var(--muted)" }}>Findings</dt><dd>{drawerScan.findings_count}</dd></div>
                  {drawerScan.stop_reason && <div style={{ display: "flex", justifyContent: "space-between" }}><dt style={{ color: "var(--muted)" }}>Stop</dt><dd>{drawerScan.stop_reason.replaceAll("_", " ")}</dd></div>}
                </dl>
                {(drawerScan.pages?.[0] as unknown as { og_image?: string; title?: string }) && (
                  <div className="og-preview">
                    <div style={{ height: 100, background: "var(--well)", display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 11 }}>Social card preview</div>
                    <div className="og-preview-body">
                      <strong>{hostOf(drawerScan.url)}</strong>
                      <span>{drawerScan.url}</span>
                    </div>
                  </div>
                )}
                <button className="copy-md-btn" onClick={() => void copyFixList(drawerScan)}>
                  <Copy size={13} aria-hidden="true" /> {copyOk ? "Copied!" : "Copy Markdown Fix-List"}
                </button>
                <div style={{ display: "flex", gap: 8 }}>
                  <a className="button" href={`/api/scans/${drawerScan.id}/export`} download style={{ flex: 1, justifyContent: "center" }}><ArrowDownToLine size={13} /> Export JSON</a>
                  <button className="button" style={{ flex: 1 }} onClick={() => { setDrawerScan(null); void submit(undefined, drawerScan); }}><RefreshCw size={13} /> Run again</button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Status({ status }: { status: Scan["status"] }) {
  const label = status === "completed" ? "Completed" : status === "running" ? "Scanning" : status === "queued" ? "Queued" : "Failed";
  return (
    <span className={`status ${status}`}>
      {status === "queued" || status === "running" ? <Loader2 size={11} className="spin" aria-hidden="true" /> : status === "completed" ? <Check size={11} aria-hidden="true" /> : <AlertTriangle size={11} aria-hidden="true" />}
      {label}
    </span>
  );
}

function CrawlerGraph({ scan, simActive }: { scan: Scan | null; simActive: boolean }) {
  const pages = scan?.pages ?? [];
  const nodes: { x: number; y: number; color: string; label: string }[] = [];
  const W = 520, H = 300;
  const cx = W / 2, cy = H / 2;

  // root
  nodes.push({ x: cx, y: cy, color: "var(--emerald)", label: scan ? hostOf(scan.url) : "root" });

  // children in a circle with slight jitter
  const displayPages: Page[] = simActive ? Array.from({ length: 6 }, (_, i) => ({ source: "url", page_url: `https://example.com/page-${i + 1}`, status_code: i === 5 ? null : 200, findings: i % 2 === 0 ? [{ rule: "x", category: "Test", severity: "warning", message: "x", evidence: "" }] : [], error: i === 5 ? "Failed" : undefined })) : pages;
  displayPages.forEach((p: Page, i: number) => {
    const angle = (i / Math.max(displayPages.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const r = 72 + (i % 3) * 18;
    const color = p.error ? "var(--crimson)" : p.findings.length > 0 ? "var(--amber)" : "var(--emerald)";
    nodes.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, color, label: p.page_url });
  });

  return (
    <svg className="graph-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Crawler node graph">
      {/* edges */}
      {nodes.slice(1).map((n, i) => (
        <motion.line
          key={`e-${i}`}
          x1={cx} y1={cy} x2={n.x} y2={n.y}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={1}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: i * 0.07 }}
        />
      ))}
      {/* nodes */}
      {nodes.map((n, i) => (
        <motion.g
          key={`n-${i}`}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20, delay: i * 0.06 }}
        >
          <circle cx={n.x} cy={n.y} r={i === 0 ? 14 : 9} fill={n.color} stroke="rgba(255,255,255,0.15)" strokeWidth={1.5} />
          {i === 0 && <circle cx={n.x} cy={n.y} r={20} fill="none" stroke={n.color} strokeWidth={1} opacity={0.25} />}
          <title>{n.label}</title>
        </motion.g>
      ))}
    </svg>
  );
}

function TerminalStream({ scan, vibe, simActive }: { scan: Scan | null; vibe: Vibe; simActive: boolean }) {
  const [lines, setLines] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const vl = vibeLines[vibe];
    const base: string[] = [vl.start];
    const pages = scan?.pages ?? [];
    if (simActive) {
      base.push(vl.page("https://example.com/ — 200 OK (simulated)"));
      base.push(vl.warn("Missing meta description on /about (simulated)"));
      base.push("…simulating crawl physics — watch the graph bloom…");
    } else {
      pages.forEach(p => {
        if (p.error) base.push(vl.fail);
        else if (p.findings.length) p.findings.forEach(f => base.push(vl.warn(f.message)));
        else base.push(vl.page(p.page_url));
      });
      if (scan?.status === "completed") base.push(vl.done);
      else if (scan?.status === "failed" && scan.error) base.push(`${vl.fail} — ${scan.error}`);
    }
    // type out progressively
    setLines([]);
    let idx = 0;
    const timer = setInterval(() => {
      if (idx >= base.length) { clearInterval(timer); return; }
      setLines(c => [...c, base[idx++]]);
    }, 320);
    return () => clearInterval(timer);
  }, [scan, vibe, simActive]);

  useEffect(() => { ref.current?.scrollTo(0, ref.current.scrollHeight); }, [lines]);

  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {lines.filter((l): l is string => typeof l === "string").map((l, i) => (
        <motion.div
          key={`${i}-${l.slice(0, 20)}`}
          className={`term-line ${l.includes("VIOLATION") || l.includes("Yikes") || l.includes("Heads up") ? "warn" : l.includes("REFUSED") || l.includes("Bounced") ? "error" : l.includes("done") || l.includes("complete") ? "success" : ""}`}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
        >
          <span style={{ opacity: 0.5, marginRight: 6 }}>{String(i + 1).padStart(2, "0")}</span>{l}
        </motion.div>
      ))}
      {lines.length === 0 && <span style={{ color: "#5a8576" }}>Waiting for scan…</span>}
    </div>
  );
}
