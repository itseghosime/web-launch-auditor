"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  AlertTriangle, ArrowDownToLine, ArrowUpRight, Check, ChevronRight, Copy, FileSearch, FlaskConical,
  Globe, History, Layers, Link2, Loader2, Radar, RefreshCw, Search, ShieldCheck,
  Terminal, Trash2, X, Zap, Eye, Target, Beaker, Dices, Sparkles,
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
  const [checksOpen, setChecksOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const selectedId = useRef<string | null>(null);
  const detailSequence = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasActiveScan = scans.some(active) || simActive;
  const isActive = hasActiveScan;
  const isIdle = !isActive && !selected;

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
    setSelectedNode(null);
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

  useEffect(() => {
    if (!scans.some(active)) return;
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
  }, [scans, refresh]);

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

  // close popovers on outside click
  useEffect(() => {
    if (!checksOpen && !dockOpen) return;
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (checksOpen && !t.closest(".checks-pill-wrap")) setChecksOpen(false);
      if (dockOpen && !t.closest(".flight-dock-wrap")) setDockOpen(false);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [checksOpen, dockOpen]);

  async function submit(event?: React.FormEvent, retry?: Scan) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const scan = await api<Scan>("scans", { method: "POST", body: JSON.stringify({ url: retry?.url ?? url.trim(), max_pages: retry?.max_pages ?? maxPages, max_depth: retry?.max_depth ?? maxDepth }) });
      setScans(c => [scan, ...c]);
      selectedId.current = scan.id;
      setSelected(scan);
      setSelectedNode(null);
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
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  function handleSimulate() {
    setSimActive(true);
    setTimeout(() => setSimActive(false), 6500);
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
  const pageErrors = (selected?.pages ?? []).filter(p => p.error);
  const activeScan: Scan | null = scans.find(active) || (simActive ? { id: "sim", url: url || "https://example.com", status: "running" as const, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), max_pages: maxPages, max_depth: maxDepth, pages_scanned: 2, findings_count: 0 } as Scan : null);
  const armedCount = Object.values(inspectors).filter(Boolean).length;
  const urlValid = isValidUrl(url.trim());
  const latestLabel = scans[0] ? `${hostOf(scans[0].url)} [${scans[0].status}]` : "—";
  const dareChips = [
    { label: "Audit itseghosime.com", url: "https://itseghosime.com", icon: Target },
    { label: "Test localhost:3000", url: "http://localhost:3000", icon: Beaker },
    { label: "Simulate Live Crawl", action: handleSimulate, icon: Dices },
  ];

  return (
    <div className={`wind-tunnel ${isActive ? "active" : "idle"}`}>
      <a href="#main" className="skip-link">Skip to content</a>

      {/* ── Floating HUD ── */}
      <header className="hud">
        <div className="hud-left">
          <span className="hud-index">00 // SYS.HUD</span>
          <a className="brand-badge" href="/" aria-label="Launch Auditor home">
            <span className="brand-badge-mark"><Radar size={13} className={`radar-sweep ${isActive ? "fast" : ""}`} aria-hidden="true" /></span>
            Launch Auditor <span style={{ opacity: 0.5, fontWeight: 400 }}>// Wind Tunnel</span>
          </a>
          <div className="checks-pill-wrap" style={{ position: "relative" }}>
            <button className="checks-pill" onClick={() => setChecksOpen(v => !v)} type="button" aria-expanded={checksOpen} aria-haspopup="true">
              🎛️ {armedCount}/4 Checks Armed
            </button>
            <AnimatePresence>
              {checksOpen && (
                <motion.div
                  className="checks-popover"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="checks-popover-head">INSPECTOR LOADOUT</div>
                  {([
                    { key: "meta" as const, icon: Sparkles, title: "Metadata & Social Cards", sub: "OG, Twitter, title" },
                    { key: "links" as const, icon: Link2, title: "Dead Link Hunter", sub: "404s & redirects" },
                    { key: "dom" as const, icon: Layers, title: "DOM Hierarchy", sub: "H1–H6 structure" },
                    { key: "a11y" as const, icon: ShieldCheck, title: "A11y Police", sub: "Images, ARIA" },
                  ]).map(m => (
                    <button key={m.key} className={`toggle-row ${inspectors[m.key] ? "" : "off"}`} onClick={() => setInspectors(c => ({ ...c, [m.key]: !c[m.key] }))} type="button">
                      <span className="toggle-icon"><m.icon size={13} aria-hidden="true" /></span>
                      <span className="toggle-text"><strong>{m.title}</strong><span>{m.sub}</span></span>
                      <span className={`pill-switch ${inspectors[m.key] ? "on" : ""}`} aria-hidden="true" />
                    </button>
                  ))}
                  <div className="spec-badge">🤖 ROBOTS.TXT RESPECTED · STEALTH HEADERS READY</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        <div className="hud-right">
          <LayoutGroup>
            <div className="vibe-switcher" role="group" aria-label="Inspector vibe">
              {([
                { id: "gentle" as Vibe, label: "Gentle Peer", icon: "🤝" },
                { id: "strict" as Vibe, label: "Strict QA", icon: "🕵️" },
                { id: "roast" as Vibe, label: "Roast Mode", icon: "🔥" },
              ]).map(v => (
                <button key={v.id} className={`vibe-btn ${vibe === v.id ? "active" : ""}`} onClick={() => setVibe(v.id)} type="button">
                  {vibe === v.id && <motion.div layoutId="vibe-bg" className="vibe-active-bg" transition={{ type: "spring", stiffness: 300, damping: 28 }} />}
                  <span style={{ position: "relative", display: "flex", alignItems: "center", gap: 3 }}><span>{v.icon}</span> {v.label}</span>
                </button>
              ))}
            </div>
          </LayoutGroup>
          <button className="sim-btn" onClick={handleSimulate} type="button" disabled={simActive}>
            <FlaskConical size={12} aria-hidden="true" /> {simActive ? "Simulating…" : "Simulate Live Crawl"}
          </button>
        </div>
      </header>

      {/* ── Stage ── */}
      <div className="stage" id="main">
        {/* Compact docked bar when active */}
        <AnimatePresence>
          {isActive && activeScan && (
            <motion.div
              className="docked-bar"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              style={{ marginBottom: 16, maxWidth: 960, width: "100%" }}
            >
              <Radar size={14} style={{ color: "var(--emerald)", flexShrink: 0 }} aria-hidden="true" />
              <span><strong>{hostOf(activeScan.url)}</strong> — {activeScan.pages_scanned} / {activeScan.max_pages} pages</span>
              <span className="progress-dots" aria-hidden="true">
                {Array.from({ length: activeScan.max_pages }).map((_, i) => (
                  <span key={i} className={i < activeScan.pages_scanned ? "filled" : ""} />
                ))}
              </span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                <Loader2 size={12} className="spin" aria-hidden="true" /> Scan in progress
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Act I: Idle Chassis ── */}
        <AnimatePresence mode="wait">
          {isIdle ? (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              style={{ width: "100%", display: "grid", placeItems: "center" }}
            >
              <div className="hero-center">
                <h1>Pre-Flight <em>Site Telemetry</em></h1>
                <p>Strap your URL into the wind tunnel before the internet finds your broken links.</p>
              </div>
              <div className="chassis">
                <div className="chassis-inner">
                  <div className="chassis-bar">
                    <span>01 // LAUNCH BAY</span>
                    <span>ONE URL PER SCAN · SAME-ORIGIN · UP TO 90S</span>
                  </div>
                  <div className="chassis-body">
                    <div>
                      <label className="well-label" htmlFor="website">Website URL — <kbd>/</kbd> to focus · <kbd>⌘ ↵</kbd> to ignite</label>
                      <div className="well">
                        <Globe size={15} style={{ color: "var(--faint)", flexShrink: 0 }} aria-hidden="true" />
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
                              TARGET LOCKED · HTTPS <span className="target-dot" aria-hidden="true" />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    <div className="dare-chips">
                      {dareChips.map(c => (
                        <button
                          key={c.label}
                          type="button"
                          className="dare-chip"
                          onClick={() => c.action ? c.action() : setUrl(c.url!)}
                        >
                          <c.icon size={12} aria-hidden="true" /> {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="control-bar">
                    <div className="control-section">
                      <span className="control-label">PAGES</span>
                      <LayoutGroup>
                        <div className="pages-pills" role="group" aria-label="Pages">
                          {[1, 5, 10, 20].map(n => (
                            <button key={n} type="button" className={`pages-pill ${maxPages === n ? "active" : ""}`} onClick={() => setMaxPages(n)}>
                              {maxPages === n && <motion.div layoutId="pages-bg-wt" className="pages-pill-bg" transition={{ type: "spring", stiffness: 300, damping: 28 }} />}
                              <span style={{ position: "relative", color: maxPages === n ? "#fff" : undefined }}>{n}</span>
                            </button>
                          ))}
                        </div>
                      </LayoutGroup>
                    </div>
                    <div className="control-section">
                      <span className="control-label">DEPTH</span>
                      <LayoutGroup>
                        <div className="depth-rings" role="group" aria-label="Depth">
                          {[1, 2, 3].map(d => (
                            <button key={d} type="button" className={`depth-ring-btn ${maxDepth === d ? "active" : ""}`} onClick={() => setMaxDepth(d)} title={d === 1 ? "Surface Skim" : d === 2 ? "Deep Dive" : "Full Excavation"}>
                              {maxDepth === d && <motion.div layoutId="depth-bg-wt" className="depth-ring-bg" transition={{ type: "spring", stiffness: 300, damping: 28 }} />}
                              <span className="ring-viz" style={{ position: "relative" }}>
                                <span className="ring ring-1" style={{ borderColor: maxDepth >= 1 ? (maxDepth === d ? "#fff" : "var(--aero)") : undefined, opacity: maxDepth >= 1 ? 1 : 0.25 }} />
                                {d >= 2 && <span className="ring ring-2" style={{ borderColor: maxDepth >= 2 ? (maxDepth === d ? "#fff" : "var(--aero)") : undefined, opacity: maxDepth >= 2 ? 1 : 0.18 }} />}
                                {d >= 3 && <span className="ring ring-3" style={{ borderColor: maxDepth >= 3 ? (maxDepth === d ? "#fff" : "var(--aero)") : undefined, opacity: maxDepth >= 3 ? 1 : 0.12 }} />}
                              </span>
                            </button>
                          ))}
                        </div>
                      </LayoutGroup>
                      <span className="depth-label">{maxDepth === 1 ? "Surface Skim" : maxDepth === 2 ? "Deep Dive" : maxDepth === 3 ? "Full Excavation" : "Start"}</span>
                      {/* hidden selects for compat */}
                      <select id="max-pages" value={maxPages} onChange={e => setMaxPages(Number(e.target.value))} className="sr-only" tabIndex={-1} aria-hidden="true">
                        {[1, 5, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <select id="max-depth" value={maxDepth} onChange={e => setMaxDepth(Number(e.target.value))} className="sr-only" tabIndex={-1} aria-hidden="true">
                        {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div className="control-section" style={{ flex: "0 0 auto", justifyContent: "flex-end" }}>
                      <motion.button
                        className="ignite-btn"
                        disabled={busy || !ready}
                        type="button"
                        onClick={() => void submit()}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        {busy ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <Zap size={15} aria-hidden="true" />}
                        {busy ? "Igniting…" : "Ignite Scan"}
                        <span className="ignite-kbd">⌘ ↵</span>
                      </motion.button>
                    </div>
                  </div>
                  {/* hidden form for Enter submit */}
                  <form onSubmit={submit} style={{ display: "none" }} aria-hidden="true">
                    <button type="submit" tabIndex={-1}>submit</button>
                  </form>
                </div>
              </div>
            </motion.div>
          ) : isActive ? (
            /* ── Act II: Live Telemetry Deck ── */
            <motion.div
              key="active"
              className="telemetry-deck"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="graph-canvas">
                <CrawlerGraph scan={activeScan ?? selected} simActive={simActive} onSelect={setSelectedNode} selectedNode={selectedNode} />
                <div className="hud-pills">
                  <span className="hud-pill">Health <em>{scans.length ? Math.round((scans.filter(s => s.status === "completed").length / scans.length) * 100) : 0}%</em></span>
                  <span className="hud-pill">🕸️ Dead Links <em>{(selected?.pages ?? []).filter(p => p.error).length}</em></span>
                  <span className="hud-pill">👻 Missing OG <em>{(selected?.pages ?? []).flatMap(p => p.findings).filter(f => f.rule.includes("og") || f.rule.includes("social")).length}</em></span>
                  <span className="hud-pill">♿ A11y <em>{(selected?.pages ?? []).flatMap(p => p.findings).filter(f => f.category === "Accessibility").length}</em></span>
                </div>
                <div className="terminal-hud">
                  <div className="terminal-hud-head">LIVE INSPECTOR — {vibe.toUpperCase()}</div>
                  <div className="terminal-hud-body">
                    <TerminalStream scan={activeScan ?? selected} vibe={vibe} simActive={simActive} />
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            /* ── Act III: Results ── */
            <motion.div
              key="results"
              className="results-pane"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <div className="results-graph">
                <CrawlerGraph scan={selected} simActive={false} onSelect={setSelectedNode} selectedNode={selectedNode} />
                {/* selected node detail */}
                {selectedNode && (
                  <motion.div
                    className="hud-pills"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ top: "auto", bottom: 16, flexDirection: "column", alignItems: "flex-start" }}
                  >
                    <span className="hud-pill" style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis" }}>
                      <Globe size={11} aria-hidden="true" /> {selectedNode}
                    </span>
                    {(() => {
                      const pg = (selected?.pages ?? []).find(p => (p.page_url || p.source) === selectedNode);
                      if (!pg) return null;
                      return (
                        <>
                          <span className="hud-pill">Status {pg.status_code ?? "—"}</span>
                          {pg.error && <span className="hud-pill" style={{ color: "#f87171" }}>{pg.error}</span>}
                          {pg.findings.length > 0 && <span className="hud-pill">⚠️ {pg.findings.length} finding{pg.findings.length > 1 ? "s" : ""}</span>}
                        </>
                      );
                    })()}
                  </motion.div>
                )}
              </div>
              <div className="receipt-pane">
                {detailLoading ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 32, color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                    <Loader2 size={16} className="spin" aria-hidden="true" /> Loading findings…
                  </div>
                ) : selected?.status === "failed" ? (
                  <div className="bouncer-card" style={{ margin: 16 }}>
                    <h3>🚧 Flight Aborted — Bouncer at the Door</h3>
                    <p>
                      {selected.error || "The site didn't let us in. This usually means:"}
                    </p>
                    <ul style={{ fontSize: 12, color: "#7f1d1d", paddingLeft: 16, display: "grid", gap: 4 }}>
                      <li>Bot protection / Cloudflare challenge</li>
                      <li>SSL handshake failure or expired certificate</li>
                      <li>Host unreachable or timed out</li>
                    </ul>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                      <button className="button" style={{ background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" }} onClick={() => void submit(undefined, selected)}>
                        <Zap size={13} aria-hidden="true" /> Retry with Stealth Headers
                      </button>
                      <button className="button" onClick={handleSimulate}><Eye size={13} aria-hidden="true" /> Run Simulated Crawl</button>
                    </div>
                    <p style={{ fontSize: 11, color: "#991b1b", fontStyle: "italic" }}>Tip: try the simulated crawl to preview the theater on this domain.</p>
                  </div>
                ) : (
                  <>
                    <div className="receipt-head">
                      <div className="receipt-title">✈ PRE-FLIGHT MANIFEST — {selected ? hostOf(selected.url).toUpperCase() : "—"}</div>
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <span className={`grade-stamp ${!selected || selected.findings_count === 0 ? "passed" : "needs-tape"}`}>
                          {!selected ? "—" : selected.findings_count === 0 ? "CLEARED FOR LAUNCH ✓" : "NEEDS DUCT TAPE"}
                        </span>
                      </div>
                    </div>
                    <div className="receipt-body">
                      {selected && (
                        <>
                          <dl className="receipt-meta">
                            <div><dt>URL</dt><dd title={selected.url}>{selected.url}</dd></div>
                            <div><dt>Scanned</dt><dd>{dateFmt(selected.created_at)}</dd></div>
                            <div><dt>Vibe</dt><dd>{vibe}</dd></div>
                            <div><dt>Pages</dt><dd>{selected.pages_scanned} / {selected.max_pages}</dd></div>
                            <div><dt>Depth</dt><dd>{selected.max_depth}</dd></div>
                            <div><dt>Findings</dt><dd>{selected.findings_count}</dd></div>
                            {selected.stop_reason && <div><dt>Stop</dt><dd>{selected.stop_reason.replaceAll("_", " ")}</dd></div>}
                          </dl>
                          <div className="og-card">
                            <div className="og-card-placeholder">
                              {selected.pages?.[0] ? "Social card preview" : "No pages crawled"}
                            </div>
                            <div className="og-card-body">
                              <strong>{selected ? hostOf(selected.url) : "—"}</strong>
                              <span>{selected.url}</span>
                            </div>
                          </div>
                          {pageErrors.length > 0 && (
                            <div style={{ display: "grid", gap: 6 }}>
                              {pageErrors.map((p, i) => (
                                <div key={i} style={{ display: "flex", gap: 8, padding: "8px 10px", borderRadius: 8, background: "var(--crimson-bg)", border: "1px solid #fecaca", fontSize: 12, color: "#991b1b" }}>
                                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                                  <div><code style={{ fontFamily: "var(--font-mono)", fontSize: 11, overflowWrap: "anywhere" }}>{p.page_url || p.source}</code><p style={{ marginTop: 2 }}>{p.error}</p></div>
                                </div>
                              ))}
                            </div>
                          )}
                          <div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                              <h3 style={{ fontSize: 12, fontWeight: 700 }}>Findings <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--alabaster-well)", padding: "2px 7px", borderRadius: 999, color: "var(--muted)" }}>{findings.length}</span></h3>
                              <div style={{ display: "flex", gap: 6 }}>
                                <label className="sr-only" htmlFor="severity">Filter by severity</label>
                                <select id="severity" aria-label="Filter by severity" value={severity} onChange={e => setSeverity(e.target.value)} style={{ height: 30, padding: "0 8px", border: "1px solid var(--alabaster-grid)", borderRadius: 8, fontSize: 11 }}>
                                  <option value="all">All</option>
                                  <option value="warning">Warnings</option>
                                  <option value="review">To review</option>
                                </select>
                                <label className="sr-only" htmlFor="category">Filter by category</label>
                                <select id="category" aria-label="Filter by category" value={category} onChange={e => setCategory(e.target.value)} style={{ height: 30, padding: "0 8px", border: "1px solid var(--alabaster-grid)", borderRadius: 8, fontSize: 11 }}>
                                  <option value="all">All</option>
                                  {categories.map(c => <option key={c}>{c}</option>)}
                                </select>
                              </div>
                            </div>
                            {filtered.length ? (
                              <div className="finding-mini-list">
                                {filtered.map((f, i) => (
                                  <div key={`${f.page}-${f.rule}-${i}`} className="finding-mini">
                                    <span className={`finding-mini-dot ${f.severity}`} aria-hidden="true" />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <strong style={{ fontSize: 12, display: "block" }}>{f.message}</strong>
                                      <span style={{ fontSize: 11, color: "var(--muted)" }}>{f.category} · <code style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{f.page}</code></span>
                                      <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{f.recommendation || ""}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: 16 }}>{findings.length ? "No findings match these filters." : "No findings on the pages checked."}</p>
                            )}
                          </div>
                          <button className="copy-md-btn" onClick={() => void copyFixList(selected)}>
                            <Copy size={13} aria-hidden="true" /> {copyOk ? "Copied!" : "Copy Markdown Fix-List"}
                          </button>
                          <div style={{ display: "flex", gap: 8 }}>
                            <a className="button" href={`/api/scans/${selected.id}/export`} download style={{ flex: 1, justifyContent: "center" }}><ArrowDownToLine size={13} aria-hidden="true" /> Export JSON</a>
                            <button className="button" style={{ flex: 1 }} onClick={() => void submit(undefined, selected)}><RefreshCw size={13} aria-hidden="true" /> Run again</button>
                            <button className="button ghost icon danger" aria-label="Delete scan" disabled={busy} onClick={() => void remove(selected)}><Trash2 size={14} aria-hidden="true" /></button>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <motion.div className="alert" role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 16 }}>
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{error}</span>
            <button className="text-button" onClick={() => { if (selected) void openScan(selected); else void refresh().catch(() => {}); }}>Try again</button>
            <button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><X size={15} aria-hidden="true" /></button>
          </motion.div>
        )}
      </div>

      {/* ── Flight Recorder Dock ── */}
      <div className="flight-dock-wrap" style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 30 }}>
        <button className="flight-dock" onClick={() => setDockOpen(v => !v)} type="button" aria-expanded={dockOpen} aria-haspopup="true">
          🗂️ Flight Logs <span className="flight-dock-count">{scans.length}</span>
          {scans[0] && <span style={{ opacity: 0.7 }}>· Latest: {latestLabel}</span>}
        </button>
        <AnimatePresence>
          {dockOpen && (
            <motion.div
              className="flight-drawer"
              initial={{ opacity: 0, y: 12, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: 12, x: "-50%" }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              style={{ left: "50%" }}
            >
              <div className="flight-drawer-head">
                <div>
                  <h3>Flight Logs</h3>
                  <p>{scans.length} scans · This session only</p>
                </div>
                <button className="icon-button" aria-label="Close flight logs" onClick={() => setDockOpen(false)}><X size={14} aria-hidden="true" /></button>
              </div>
              <div className="flight-search">
                <Search size={13} style={{ color: "var(--faint)", flexShrink: 0 }} aria-hidden="true" />
                <input aria-label="Search scans" placeholder="Search by website…" value={query} onChange={e => setQuery(e.target.value)} />
              </div>
              <div className="flight-list" id="scan-history">
                {loading ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 20, color: "var(--muted)", fontSize: 12 }}>
                    <Loader2 size={14} className="spin" aria-hidden="true" /> Loading…
                  </div>
                ) : scans.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 20, color: "var(--muted)", fontSize: 12 }}>
                    <p style={{ fontWeight: 600, color: "var(--ink)" }}>No scans yet</p>
                    <p>Enter a URL in the Launch Bay to begin.</p>
                  </div>
                ) : shownScans.length ? (
                  shownScans.map(s => (
                    <button key={s.id} className={`flight-row ${selected?.id === s.id ? "selected" : ""}`} onClick={() => { void openScan(s); setDockOpen(false); }}>
                      <span style={{ width: 22, height: 22, borderRadius: 6, background: "var(--alabaster-well)", display: "grid", placeItems: "center", flexShrink: 0, overflow: "hidden" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={faviconUrl(s.url)} alt="" style={{ width: 14, height: 14 }} onError={e => ((e.target as HTMLImageElement).style.display = "none")} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <strong style={{ display: "block", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hostOf(s.url)}</strong>
                        <small style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.url}</small>
                      </span>
                      <Status status={s.status} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", flexShrink: 0 }}>{s.pages_scanned}/{s.max_pages}</span>
                      <ChevronRight size={14} style={{ color: "var(--faint)", flexShrink: 0 }} aria-hidden="true" />
                    </button>
                  ))
                ) : (
                  <div style={{ textAlign: "center", padding: 16, color: "var(--muted)", fontSize: 12 }}>No matching websites</div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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

function CrawlerGraph({ scan, simActive, onSelect, selectedNode }: { scan: Scan | null; simActive: boolean; onSelect?: (url: string) => void; selectedNode?: string | null }) {
  const pages = scan?.pages ?? [];
  const nodes: { x: number; y: number; color: string; label: string; selected: boolean }[] = [];
  const W = 640, H = 420;
  const cx = W / 2, cy = H / 2;

  nodes.push({ x: cx, y: cy, color: "var(--emerald)", label: scan ? hostOf(scan.url) : "root", selected: selectedNode === (scan?.url ?? "") });

  const displayPages: Page[] = simActive
    ? Array.from({ length: 6 }, (_, i) => ({
        source: "url",
        page_url: `https://example.com/page-${i + 1}`,
        status_code: i === 5 ? null : 200,
        findings: i % 2 === 0 ? [{ rule: "x", category: "Test", severity: "warning" as const, message: "x", evidence: "" }] : [],
        error: i === 5 ? "Failed" : undefined,
      }))
    : pages;

  displayPages.forEach((p: Page, i: number) => {
    const angle = (i / Math.max(displayPages.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const r = 80 + (i % 3) * 20;
    const color = p.error ? "var(--crimson)" : p.findings.length > 0 ? "var(--amber)" : "var(--emerald)";
    const label = p.page_url || p.source;
    nodes.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, color, label, selected: selectedNode === label });
  });

  return (
    <svg className="graph-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Crawler node graph">
      {/* radar rings */}
      {[60, 120, 180].map(r => (
        <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="rgba(16,185,129,0.07)" strokeWidth={1} />
      ))}
      {/* edges */}
      {nodes.slice(1).map((n, i) => (
        <motion.line
          key={`e-${i}`}
          x1={cx} y1={cy} x2={n.x} y2={n.y}
          stroke={n.selected ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)"}
          strokeWidth={n.selected ? 1.5 : 1}
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
          style={{ cursor: onSelect && i !== 0 ? "pointer" : undefined }}
          onClick={() => onSelect?.(n.label)}
        >
          <circle cx={n.x} cy={n.y} r={i === 0 ? 16 : n.selected ? 12 : 9} fill={n.color} stroke={n.selected ? "#fff" : "rgba(255,255,255,0.2)"} strokeWidth={n.selected ? 2 : 1.5} />
          {i === 0 && <circle cx={n.x} cy={n.y} r={24} fill="none" stroke={n.color} strokeWidth={1} opacity={0.2} />}
          <title>{n.label}</title>
        </motion.g>
      ))}
      {/* center label */}
      <text x={cx} y={cy + 30} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fill="rgba(255,255,255,0.4)" letterSpacing="0.06em">
        {scan ? hostOf(scan.url) : "WIND TUNNEL"}
      </text>
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
    setLines([]);
    let idx = 0;
    const timer = setInterval(() => {
      if (idx >= base.length) { clearInterval(timer); return; }
      const next = base[idx++];
      if (typeof next === "string") setLines(c => [...c, next]);
    }, 300);
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
