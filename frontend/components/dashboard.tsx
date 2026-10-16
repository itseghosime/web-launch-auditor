"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { LaunchPreview, FeatureOverview } from "./launch-preview";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Code,
  Copy,
  ExternalLink,
  GitCompare,
  Globe,
  History,
  Layers,
  Link2,
  Loader2,
  MessageCircle,
  Radar,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Target,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { stackDisplayName } from "./stack";
export { stackDisplayName };

type Finding = {
  rule: string;
  category: string;
  severity: "warning" | "review";
  message: string;
  evidence: unknown;
  recommendation?: string;
};

type SocialPreview = {
  title?: string;
  description?: string;
  image?: string;
  domain?: string;
};

type Page = {
  source: string;
  page_url: string;
  status_code: number | null;
  findings: Finding[];
  error?: string;
  load_ms?: number;
  social_preview?: SocialPreview;
};

type Scan = {
  id: string;
  url: string;
  status: "queued" | "running" | "completed" | "failed";
  created_at: string;
  updated_at: string;
  max_pages: number;
  max_depth: number;
  pages_scanned: number;
  findings_count: number;
  error?: string;
  pages?: Page[];
  stop_reason?: string;
  score?: number;
  stack?: string;
  source?: string;
  ai_prompt?: string;
};

type Vibe = "gentle" | "strict" | "roast";

function FrameworkBadge({ scan }: { scan: Scan | null }) {
  const pending = scan?.status === "queued" || scan?.status === "running";
  const stack = scan?.stack?.trim();
  const detected = stack && stack.toLowerCase() !== "html";
  const label = pending ? "Detecting…" : detected
    ? stackDisplayName(stack)
    : scan?.status === "failed" ? "Unavailable" : "Not identified";
  return <span className="framework-badge" role="status" aria-label={`Framework: ${label}`}
    title={pending ? "Framework detection completes with the audit." : detected ? "Detected from the website’s HTML and response headers." : "No recognizable framework signature was found. This does not mean the site uses no framework."}>
    <Layers size={13} aria-hidden="true" /><span>Framework</span><strong>{label}</strong>
  </span>;
}


const active = (s: Scan) => s.status === "queued" || s.status === "running";
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url || "target.local";
  }
};
const pathOf = (url: string) => {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? "/index" : u.pathname;
  } catch {
    return url;
  }
};
const dateFmt = (v: string) =>
  new Date(v).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const faviconUrl = (url: string) => {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;
  } catch {
    return "";
  }
};
const isValidUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

export function isLocalhostUrl(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "::1" ||
      host.endsWith(".local")
    );
  } catch {
    return false;
  }
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      typeof error.detail === "string"
        ? error.detail
        : error.detail?.[0]?.msg || "Something went wrong. Please try again."
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

const vibeLines: Record<
  Vibe,
  {
    start: string;
    page: (url: string) => string;
    warn: (msg: string) => string;
    done: string;
    fail: string;
  }
> = {
  gentle: {
    start: "01 // GENTLE PEER — Warming up telemetry probes, inspecting origin…",
    page: (u) => `Inspected ${u} — HTML checks complete.`,
    warn: (m) => `Notice: ${m}`,
    done: "Audit complete — review the findings before launch.",
    fail: "Endpoint unreachable — check firewall or origin availability.",
  },
  strict: {
    start: "02 // STRICT QA — Initiating zero-tolerance audit sweep…",
    page: (u) => `AUDIT -> ${u} — inspecting metadata, main headings & alt text…`,
    warn: (m) => `VIOLATION: ${m}`,
    done: "Sweep complete. Remediate flagged items prior to production sign-off.",
    fail: "CONNECTION REFUSED — target host unreachable or blocked by WAF.",
  },
  roast: {
    start: "03 // ROAST MODE — Pressurizing wind tunnel for unvarnished critique…",
    page: (u) => `Inspecting ${u} — checking if social meta tags actually exist…`,
    warn: (m) => `Critique — ${m}`,
    done: "Audit complete. Patch these structural gaps before shipping.",
    fail: "Origin rejected probe — bot challenge or server timeout.",
  },
};

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      ease: EASE_OUT_EXPO,
    },
  },
};

const staggerItem = {
  hidden: { opacity: 0.92, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: EASE_OUT_EXPO },
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
  const [inspectors, setInspectors] = useState({
    meta: true,
    links: true,
    dom: true,
    a11y: true,
  });
  const [resultView, setResultView] = useState<"findings" | "social">("findings");
  const [findingPage, setFindingPage] = useState(0);
  const [copyOk, setCopyOk] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [checksOpen, setChecksOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [socialTab, setSocialTab] = useState<"x" | "whatsapp" | "linkedin" | "imessage">("x");
  const [comparedScanId, setComparedScanId] = useState<string | null>(null);

  const [localhostModal, setLocalhostModal] = useState<{
    open: boolean;
    targetUrl: string;
    tab: "tunnel" | "cors";
    tunnelUrl: string;
    copiedSnippet: boolean;
    copiedTunnel: boolean;
  }>({
    open: false,
    targetUrl: "",
    tab: "tunnel",
    tunnelUrl: "",
    copiedSnippet: false,
    copiedTunnel: false,
  });

  const [shareModal, setShareModal] = useState<{
    open: boolean;
    reportId: string;
    shareUrl: string;
    badgeUrl: string;
    loading: boolean;
    error: string;
    copiedLink: boolean;
    copiedBadge: boolean;
  }>({
    open: false,
    reportId: "",
    shareUrl: "",
    badgeUrl: "",
    loading: false,
    error: "",
    copiedLink: false,
    copiedBadge: false,
  });

  const selectedId = useRef<string | null>(null);
  const detailSequence = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasActiveScan = scans.some(active);
  const isActive = hasActiveScan;
  const isIdle = !isActive && !selected;

  useEffect(() => {
    try {
      const v = localStorage.getItem("la-vibe") as Vibe | null;
      if (v && ["gentle", "strict", "roast"].includes(v)) setVibe(v);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("la-vibe", vibe);
    } catch {}
  }, [vibe]);

  const refresh = useCallback(async () => {
    const result = await api<{ items: Scan[] }>("scans");
    setScans(result.items);
    setReady(true);
  }, []);

  const openScan = useCallback(async (scan: Scan) => {
    selectedId.current = scan.id;
    const seq = ++detailSequence.current;
    setSelected(scan);
    setSelectedNode(scan.pages?.[0]?.page_url || scan.url);
    setDetailLoading(true);
    setSeverity("all");
    setCategory("all");
    setResultView("findings");
    setFindingPage(0);
    setError("");
    try {
      const detail = await api<Scan>(`scans/${scan.id}`);
      if (seq === detailSequence.current) {
        setSelected(detail);
        setSelectedNode(detail.pages?.[0]?.page_url || detail.url);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (seq === detailSequence.current) setDetailLoading(false);
    }
  }, []);

  const resetStage = useCallback(() => {
    selectedId.current = null;
    detailSequence.current++;
    setSelected(null);
    setSelectedNode(null);
    setChecksOpen(false);
    setDockOpen(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (!scans.some(active)) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        await refresh();
        const id = selectedId.current;
        if (id && !id.startsWith("sim-")) {
          const seq = detailSequence.current;
          const detail = await api<Scan>(`scans/${id}`);
          if (seq === detailSequence.current && selectedId.current === id) {
            setSelected(detail);
          }
        }
        setError("");
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    }, 2500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [scans, refresh]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "Enter" &&
        ready &&
        !busy &&
        isValidUrl(url.trim())
      ) {
        e.preventDefault();
        void submit();
      }
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLSelectElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        if (localhostModal.open) setLocalhostModal((m) => ({ ...m, open: false }));
        else if (shareModal.open) setShareModal((m) => ({ ...m, open: false }));
        else if (checksOpen || dockOpen) { setChecksOpen(false); setDockOpen(false); }
        else resetStage();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  useEffect(() => {
    if (!checksOpen && !dockOpen) return;
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (checksOpen && !t.closest(".modules-popover-wrap")) setChecksOpen(false);
      if (dockOpen && !t.closest(".flight-dock-wrap")) setDockOpen(false);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [checksOpen, dockOpen]);

  useEffect(() => {
    if (!localhostModal.open && !shareModal.open) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => document.querySelector<HTMLElement>(".launch-modal-panel")?.focus());
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const panel = document.querySelector<HTMLElement>(".launch-modal-panel");
      const items = panel?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, [tabindex="0"]');
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", trap); previous?.focus(); };
  }, [localhostModal.open, shareModal.open]);

  async function submit(event?: React.FormEvent, retry?: Scan) {
    event?.preventDefault();
    if (busy) return;
    setResultView("findings");
    setFindingPage(0);
    const targetUrl = retry?.url ?? url.trim();
    if (!targetUrl) {
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");

    const pagesLimit = retry?.max_pages ?? maxPages;
    const depthLimit = retry?.max_depth ?? maxDepth;

    if (isLocalhostUrl(targetUrl)) {
      try {
        let rootRes: Response;
        try {
          rootRes = await fetch(targetUrl, { mode: "cors", credentials: "omit" });
        } catch {
          setLocalhostModal({
            open: true,
            targetUrl,
            tab: "tunnel",
            tunnelUrl: "",
            copiedSnippet: false,
            copiedTunnel: false,
          });
          setBusy(false);
          return;
        }

        const rootHtml = await rootRes.text();
        const pagesToAnalyze: { url: string; status: number; html: string }[] = [
          { url: targetUrl, status: rootRes.status, html: rootHtml },
        ];

        if (pagesLimit > 1 && depthLimit >= 1 && typeof DOMParser !== "undefined") {
          try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(rootHtml, "text/html");
            const links = Array.from(doc.querySelectorAll("a[href]"));
            const targetOrigin = new URL(targetUrl).origin;
            const discovered = new Set<string>();

            for (const a of links) {
              const href = a.getAttribute("href")?.trim();
              if (
                !href ||
                href.startsWith("#") ||
                href.startsWith("javascript:") ||
                href.startsWith("mailto:") ||
                href.startsWith("tel:")
              ) {
                continue;
              }
              try {
                const resolved = new URL(href, targetUrl);
                if (resolved.origin === targetOrigin && resolved.href !== targetUrl) {
                  resolved.hash = "";
                  discovered.add(resolved.href);
                }
              } catch {}
            }

            const queue = Array.from(discovered).slice(0, pagesLimit - 1);
            for (const nextUrl of queue) {
              try {
                const subRes = await fetch(nextUrl, { mode: "cors", credentials: "omit" });
                const subHtml = await subRes.text();
                pagesToAnalyze.push({ url: nextUrl, status: subRes.status, html: subHtml });
              } catch {}
            }
          } catch {}
        }

        const scan = await api<Scan>("analyze-raw-html", {
          method: "POST",
          body: JSON.stringify({
            url: targetUrl,
            pages: pagesToAnalyze,
            max_pages: pagesLimit,
            max_depth: depthLimit,
          }),
        });

        setScans((c) => [scan, ...c.filter((x) => x.id !== scan.id)]);
        selectedId.current = scan.id;
        setSelected(scan);
        setSelectedNode(scan.url);
        detailSequence.current++;
        setSeverity("all");
        setCategory("all");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }

    try {
      const scan = await api<Scan>("scans", {
        method: "POST",
        body: JSON.stringify({
          url: targetUrl,
          max_pages: pagesLimit,
          max_depth: depthLimit,
        }),
      });
      setScans((c) => [scan, ...c.filter((x) => x.id !== scan.id)]);
      selectedId.current = scan.id;
      setSelected(scan);
      setSelectedNode(scan.url);
      detailSequence.current++;
      setSeverity("all");
      setCategory("all");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(scan: Scan) {
    if (!window.confirm(`Delete the saved scan for ${hostOf(scan.url)}?`)) return;
    if (scan.id.startsWith("sim-")) {
      setScans((c) => c.filter((s) => s.id !== scan.id));
      resetStage();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`scans/${scan.id}`, { method: "DELETE" });
      setScans((c) => c.filter((s) => s.id !== scan.id));
      selectedId.current = null;
      detailSequence.current++;
      setSelected(null);
      setSelectedNode(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyFixList(scan: Scan) {
    const list = (scan.pages ?? []).flatMap((p) =>
      p.findings.map(
        (f) =>
          `- [ ] **${f.message}** (${f.category}) — ${p.page_url || p.source}\n  > ${
            f.recommendation || ""
          }`
      )
    );
    const md = `# Fix list — ${scan.url}\n\n${
      list.join("\n") || "_No findings — ship it!_"
    }\n`;
    try {
      await navigator.clipboard.writeText(md);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1800);
    } catch {}
  }

  async function copyAiPrompt(scan: Scan) {
    const promptText =
      scan.ai_prompt ||
      `# Launch Auditor Fix Request for ${scan.url}\n` +
      `Stack: ${scan.stack || "web"}\n\n` +
      (scan.pages ?? [])
        .flatMap((p) =>
          p.findings.map(
            (f) =>
              `- [ ] ${f.message} (${f.category})\n  URL: ${p.page_url || p.source}\n  Recommendation: ${f.recommendation || "Fix issue"}`
          )
        )
        .join("\n");

    try {
      await navigator.clipboard.writeText(promptText);
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = promptText;
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      } catch {}
    }
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2400);
  }

  async function handleOpenShare(scan: Scan) {
    if (!scan) return;
    setShareModal({
      open: true,
      reportId: "",
      shareUrl: "",
      badgeUrl: "",
      loading: true,
      error: "",
      copiedLink: false,
      copiedBadge: false,
    });
    try {
      const data = await api<{ report_id: string; share_url: string; badge_url: string }>(
        `scans/${scan.id}/share`,
        { method: "POST" }
      );
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const shareUrl = data.share_url?.startsWith("http") ? data.share_url : `${origin}${data.share_url || ""}`;
      const badgeUrl = data.badge_url?.startsWith("http") ? data.badge_url : `${origin}${data.badge_url || ""}`;
      setShareModal({
        open: true,
        reportId: data.report_id,
        shareUrl,
        badgeUrl,
        loading: false,
        error: "",
        copiedLink: false,
        copiedBadge: false,
      });
    } catch (err) {
      setShareModal((prev) => ({
        ...prev,
        loading: false,
        error: (err as Error).message || "Could not generate share report.",
      }));
    }
  }

  const findings = (selected?.pages ?? []).flatMap((p) =>
    p.findings.map((f) => ({ ...f, page: p.page_url || p.source }))
  );
  const filtered = findings.filter(
    (f) =>
      ({ metadata: inspectors.meta, social: inspectors.meta, seo: inspectors.meta, links: inspectors.links, secrets: inspectors.links, structure: inspectors.dom, accessibility: inspectors.a11y }[f.category.toLowerCase()] ?? true) &&
      (severity === "all" || f.severity === severity) &&
      (category === "all" || f.category === category)
  );
  const findingPages = Math.max(1, Math.ceil(filtered.length / 3));
  const visibleFindingPage = Math.min(findingPage, findingPages - 1);
  const visibleFindings = filtered.slice(visibleFindingPage * 3, visibleFindingPage * 3 + 3);
  const categories = Array.from(new Set(findings.map((f) => f.category))).sort();
  const shownScans = scans.filter((s) =>
    s.url.toLowerCase().includes(query.toLowerCase())
  );
  const pageErrors = (selected?.pages ?? []).filter((p) => p.error);

  const activeScan: Scan | null = scans.find(active) ?? null;

  const armedCount = Object.values(inspectors).filter(Boolean).length;
  const urlValid = isValidUrl(url.trim());
  const currentScan = activeScan ?? selected;

  const computedScore = currentScan
    ? currentScan.status === "failed"
      ? 0
      : currentScan.score ?? Math.max(38, 100 - findings.length * 9 - pageErrors.length * 16)
    : 100;

  const previousScan =
    scans.find(
      (s) =>
        s.id !== currentScan?.id &&
        (comparedScanId ? s.id === comparedScanId : hostOf(s.url) === hostOf(currentScan?.url || ""))
    ) ?? null;

  const currentRuleSet = new Set(
    (currentScan?.pages ?? []).flatMap((p) => p.findings.map((f) => f.rule))
  );
  const previousRuleSet = new Set(
    (previousScan?.pages ?? []).flatMap((p) => p.findings.map((f) => f.rule))
  );

  const fixedRules = Array.from(previousRuleSet).filter((r) => !currentRuleSet.has(r));
  const newOrRemainingRules = Array.from(currentRuleSet);

  const prevScoreVal = previousScan ? (previousScan.score ?? 50) : null;
  const deltaScore = prevScoreVal !== null ? computedScore - prevScoreVal : null;

  const isLocalRelay = Boolean(
    currentScan?.source === "relay" ||
    (currentScan?.url && isLocalhostUrl(currentScan.url))
  );

  const selectedPageObj =
    (currentScan?.pages ?? []).find(
      (p) => (p.page_url || p.source) === selectedNode
    ) ?? currentScan?.pages?.[0];
  const socialPreviewData = selectedPageObj?.social_preview;
  const socialDomain =
    socialPreviewData?.domain ||
    (currentScan ? hostOf(currentScan.url) : "example.com");
  const socialTitle =
    socialPreviewData?.title ||
    (currentScan ? hostOf(currentScan.url) : "Pre-Flight Web Preview");
  const socialDesc =
    socialPreviewData?.description ||
    "Ensure high-fidelity social previews and OpenGraph tags prior to production release.";
  const socialImage = socialPreviewData?.image;
  const hasSocialImage = Boolean(socialImage && socialImage.trim().length > 0);

  const [hasGlitch, setHasGlitch] = useState(false);
  const prevPagesCountRef = useRef(0);

  useEffect(() => {
    const currentPagesCount = currentScan?.pages?.length ?? 0;
    const hasError = Boolean(pageErrors.length > 0 || currentScan?.status === "failed");
    if (currentPagesCount > prevPagesCountRef.current || hasError) {
      setHasGlitch(true);
      const timer = setTimeout(() => setHasGlitch(false), 380);
      prevPagesCountRef.current = currentPagesCount;
      return () => clearTimeout(timer);
    }
    prevPagesCountRef.current = currentPagesCount;
  }, [currentScan?.pages?.length, pageErrors.length, currentScan?.status]);

  return (
    <MotionConfig reducedMotion="user">
    <div className={`obsidian-root launch-workspace ${isIdle ? "is-idle" : "is-results"} ${isActive ? "is-scanning" : ""}`} >
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      {/* ── 1. Whisper-Quiet Silver-White Top Specular Light Source ── */}
      <div
        className="silver-top-light bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(255,255,255,0.07),transparent)]"
        aria-hidden="true"
      />

      {/* ── 2. Full-Viewport 60fps HTML5 Physics Engine Canvas (fixed inset-0 z-10) ── */}
      {!isIdle && <ViewportPhysicsCanvas
        isIdle={isIdle}
        isActive={isActive}
        scan={currentScan}
        selectedNode={selectedNode}
        onSelectNode={setSelectedNode}
      />}

      {/* ── Top Telemetry Command Bar (Monochrome Smoked Titanium) ── */}
      <header className="telemetry-topbar h-14 border-b border-white/[0.08] bg-[#050506]/80 backdrop-blur-2xl px-6 flex items-center justify-between z-30">
        <div className="topbar-left">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              resetStage();
            }}
            className="brand-link"
            aria-label="Launch Auditor home"
          >
            <span className="status-cube">
              <Radar
                size={13}
                strokeWidth={1.5}
                className={isActive ? "spin" : ""}
                aria-hidden="true"
              />
            </span>
            <span>launch<span className="brand-light">auditor</span><span className="brand-period">.</span></span>
            <span className="slash-badge">PRE-FLIGHT</span>
            {isLocalRelay && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium tracking-wide bg-amber-500/15 border border-amber-500/30 text-amber-300">
                [LOCAL RELAY]
              </span>
            )}
            {!isActive && currentScan?.stack && currentScan.stack.toLowerCase() !== "html" && (
              <span
                data-testid="topbar-framework-badge"
                className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium tracking-wide bg-cyan-500/10 border border-cyan-500/30 text-cyan-300"
              >
                <Layers size={11} className="text-cyan-400" />
                <span>{stackDisplayName(currentScan.stack).toUpperCase()}</span>
              </span>
            )}
          </a>

          <div className="modules-popover-wrap" style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setChecksOpen((v) => !v)}
              aria-expanded={checksOpen}
              aria-haspopup="true"
              className="modules-armed-btn bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.08] hover:border-white/[0.18] text-zinc-300 hover:text-white transition-all duration-300"
            >
              <span className="led-dot emerald" aria-hidden="true" />
              <SlidersHorizontal size={12} strokeWidth={1.5} aria-hidden="true" />
              <span>{armedCount}/4 check groups</span>
            </button>

            <AnimatePresence>
              {checksOpen && (
                <motion.div
                  className="modules-popover"
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
                >
                  <div className="popover-header">
                    <span>REPORT FILTERS</span>
                    <span style={{ color: "#E4E4E7" }}>{armedCount}/4 SHOWN</span>
                  </div>
                  <p style={{ fontSize: 11, color: "#a1ad98" }}>All checks run. Choose which findings to display.</p>
                  {(
                    [
                      {
                        key: "meta" as const,
                        icon: Sparkles,
                        title: "Metadata & OG",
                        sub: "Open Graph, titles, descriptions, canonicals",
                      },
                      {
                        key: "links" as const,
                        icon: Link2,
                        title: "Links & launch leaks",
                        sub: "Internal links, empty anchors, local references",
                      },
                      {
                        key: "dom" as const,
                        icon: Layers,
                        title: "DOM Hierarchy",
                        sub: "Missing, empty, or multiple main headings",
                      },
                      {
                        key: "a11y" as const,
                        icon: ShieldCheck,
                        title: "Accessibility hints",
                        sub: "Image alt text and document language",
                      },
                    ] as const
                  ).map((m) => {
                    const isArmed = Boolean(inspectors[m.key]);
                    return (
                      <button
                        key={m.key}
                        type="button"
                        role="switch"
                        aria-checked={isArmed}
                        onClick={() =>
                          setInspectors((c) => ({ ...c, [m.key]: !c[m.key] }))
                        }
                        className={`module-toggle-item ${
                          isArmed ? "armed" : "disarmed"
                        }`}
                      >
                        <span className="module-icon-box">
                          <m.icon size={13} strokeWidth={1.5} aria-hidden="true" />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <strong
                            style={{
                              display: "block",
                              fontSize: "0.85rem",
                              fontWeight: 600,
                              color: "#FFFFFF",
                            }}
                          >
                            {m.title}
                          </strong>
                          <span
                            style={{
                              display: "block",
                              fontSize: "0.72rem",
                              color: "#94A3B8",
                            }}
                          >
                            {m.sub}
                          </span>
                        </span>
                        <span className="module-switch-wrap">
                          <span className={`switch-status-pill ${isArmed ? "on" : "off"}`}>
                            {isArmed ? "ON" : "OFF"}
                          </span>
                          <span
                            className={`module-switch ${isArmed ? "on" : ""}`}
                            aria-hidden="true"
                          />
                        </span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <nav className="workspace-nav" aria-label="Main navigation">
          <button type="button" onClick={resetStage} className={isIdle ? "nav-current" : ""}>Overview</button>
          {isIdle && <a href="#capabilities">What’s checked</a>}
          <button type="button" onClick={(e) => { e.stopPropagation(); setDockOpen((v) => !v); }} aria-expanded={dockOpen}><History size={15} /> History <span>{scans.length}</span></button>
        </nav>
      </header>

      {/* ── Main Center Stage (Choreographed Transitions) ── */}
      <main id="main" className="center-stage-wrap">
        <AnimatePresence mode="wait" initial={false}>
          {isIdle ? (
            /* ── Act I: Centered Smoked Titanium Command Core ── */
            <motion.div
              key="command-core"
              initial={{ opacity: 0, y: 12, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -18, scale: 0.97 }}
              transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
              className="command-core-container"
            >
              <div className="launch-hero-grid">
              <div className="launch-hero-copy">
              <div className="eyebrow-wrap">
                <span className="eyebrow-pill">
                  <span className="led-dot emerald" aria-hidden="true" />
                  <span>THE LAST CHECK BEFORE YOUR BIG LAUNCH</span>
                </span>
              </div>

              <h1 className="hero-title text-3xl md:text-4xl font-semibold tracking-tight bg-gradient-to-b from-white via-zinc-100 to-zinc-500 bg-clip-text text-transparent">
                Built with care.<br />Launch with <span>confidence.</span>
              </h1>

              <p className="hero-subtitle text-sm text-slate-400 max-w-lg mx-auto leading-relaxed mb-6">
                The little things make the first impression. Catch missing metadata,
                preview your social cards, and turn launch-day doubts into a clear fix list.
              </p>

              {/* Smoked Titanium Glass Command Chassis */}
              <div className="command-chassis bg-[#0A0B0E]/80 backdrop-blur-2xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_24px_60px_rgba(0,0,0,0.75)]">
                <div className="chassis-header-bar">
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="led-dot silver" aria-hidden="true" />
                    <span>YOUR PRE-LAUNCH CHECKLIST</span>
                  </span>
                  <span>PUBLIC URL OR LOCALHOST</span>
                </div>

                <div className="chassis-main-pad">
                  <form onSubmit={(e) => void submit(e)}>
                    <label htmlFor="website" className="url-well-label">
                      <span>Website URL</span>
                      <span>⌘ + ENTER TO SCAN</span>
                    </label>

                    <div className={`command-well h-12 ${isActive ? "scan-rumble" : ""} ${hasGlitch ? "glitch-swell" : ""}`}>
                      <Globe
                        size={16}
                        strokeWidth={1.5}
                        style={{
                          color: urlValid ? "#F4F4F6" : "#71717A",
                          marginLeft: "0.55rem",
                          flexShrink: 0,
                        }}
                        aria-hidden="true"
                      />

                      <input
                        ref={inputRef}
                        id="website"
                        aria-label="Website URL"
                        type="url"
                        placeholder="https://your-next-big-thing.com"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        required
                        maxLength={2048}
                        autoComplete="url"
                        spellCheck={false}
                        className="well-input text-base font-mono"
                      />

                      {url.trim().length > 0 && (
                        <span className="target-locked-badge">
                          <span className="led-dot emerald" aria-hidden="true" />
                          {urlValid && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={faviconUrl(url)}
                              alt=""
                              onError={(e) =>
                                ((e.target as HTMLImageElement).style.display =
                                  "none")
                              }
                            />
                          )}
                          <span>TARGET LOCKED</span>
                        </span>
                      )}

                      <button
                        type="submit"
                        disabled={busy || !ready}
                        className="ignite-scan-btn bg-white text-[#050506] hover:bg-zinc-200 font-medium px-6 py-2.5 rounded-lg shadow-[0_0_25px_rgba(255,255,255,0.18)] transition-all active:scale-[0.98]"
                      >
                        {busy ? (
                          <Loader2
                            size={15}
                            strokeWidth={1.5}
                            className="spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <ArrowUpRight
                            size={15}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                        )}
                        <span>{busy ? "Starting…" : "Audit my site"}</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Bottom Telemetry Control Strip */}
                <div className="telemetry-control-strip">
                  <div
                    className="control-group"
                    role="group"
                    aria-label="Max Pages"
                  >
                    <span className="control-group-label text-xs">MAX PAGES</span>
                    {[1, 5, 10, 20].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setMaxPages(n)}
                        aria-pressed={maxPages === n}
                        className={`page-seg-btn text-xs font-medium px-3 py-1.5 ${
                          maxPages === n ? "active bg-white text-black" : ""
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>

                  <div
                    className="control-group"
                    role="group"
                    aria-label="Crawl Depth"
                  >
                    <span className="control-group-label text-xs">CRAWL DEPTH</span>
                    {(
                      [
                        { d: 0, label: "0" },
                        { d: 1, label: "1" },
                        { d: 2, label: "2" },
                        { d: 3, label: "3" },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.d}
                        type="button"
                        onClick={() => setMaxDepth(item.d)}
                        aria-pressed={maxDepth === item.d}
                        aria-label={`Crawl depth ${item.d}`}
                        className={`depth-mode-btn text-xs font-medium px-3 py-1.5 whitespace-nowrap ${
                          maxDepth === item.d
                            ? "active bg-white/15 text-white border-white/30"
                            : ""
                        }`}
                      >
                        <Radar size={11} strokeWidth={1.5} aria-hidden="true" />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="launch-assurance"><span><Check size={14} /> No account needed</span><span><Terminal size={14} /> Localhost friendly</span><span><ShieldCheck size={14} /> Actionable fixes</span></div>
                      <div className="audit-tone">
          <span className="tone-label">Feedback style</span>
          <div
            className="persona-segmented"
            role="group"
            aria-label="Inspector Persona"
          >
            {(
              [
                { id: "gentle" as Vibe, label: "Gentle Peer" },
                { id: "strict" as Vibe, label: "Strict QA" },
                { id: "roast" as Vibe, label: "Roast Mode" },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setVibe(p.id)}
                aria-pressed={vibe === p.id}
                className={`persona-tab ${
                  vibe === p.id ? "active" : ""
                }`}
              >
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </div>
              </div>
              <LaunchPreview />
              </div>
              <div className="stack-strip"><span>BUILT FOR THE WAY YOU BUILD</span><div><strong>Next.js</strong><strong className="stack-astro">✦ astro</strong><strong>Vite <span>ϟ</span></strong><strong>Remix</strong><strong className="stack-wordpress">ⓦ WordPress</strong><strong>Webflow</strong><span>+ plain HTML</span></div></div>
              <FeatureOverview />
            </motion.div>
          ) : (
            /* ── Act II & III: Full-Viewport Canvas + Floating Smoked-Glass HUD ── */
            <motion.div
              key="active-hud-stage"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
              className={`active-hud-stage ${isActive ? "scan-rumble" : ""} ${hasGlitch ? "glitch-swell" : ""}`}
            >
              {/* Sleek Compact Floating Top Bar (Morphed Command Core) */}
              <motion.div
                initial={{ opacity: 0, y: -16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
                className="floating-compact-command-bar max-w-2xl mx-auto mt-4 bg-[#0A0B0E]/90 backdrop-blur-2xl border border-white/10 rounded-xl px-4 py-2.5 flex items-center justify-between z-30"
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.55rem",
                    flexWrap: "wrap",
                    minWidth: 0,
                    fontFamily: "var(--font-mono), monospace",
                    fontSize: "0.72rem",
                  }}
                >
                  <span
                    className={`led-dot ${
                      currentScan?.status === "failed"
                        ? "rose"
                        : isActive
                        ? "silver"
                        : "emerald"
                    }`}
                    aria-hidden="true"
                  />
                  <strong style={{ color: "#ffffff", fontWeight: 500 }}>
                    {currentScan ? hostOf(currentScan.url) : "TELEMETRY"}
                  </strong>
                  <span style={{ color: "#52525B" }}>//</span>
                  {isActive ? (
                    <span
                      style={{
                        color: "#D4D4D8",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Loader2
                        size={12}
                        strokeWidth={1.5}
                        className="spin"
                        aria-hidden="true"
                      />
                      <span>
                        Scan in progress ({currentScan?.pages_scanned ?? 0}/
                        {currentScan?.max_pages ?? maxPages})
                      </span>
                    </span>
                  ) : (
                    <span style={{ color: "#A1A1AA" }}>
                      {currentScan?.status === "failed"
                        ? "FLIGHT ABORTED"
                        : `${currentScan?.pages_scanned ?? 0}/${
                            currentScan?.max_pages ?? maxPages
                          } PAGES LOCKED`}
                    </span>
                  )}
                  <FrameworkBadge scan={currentScan} />
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    aria-label="Website URL"
                    type="url"
                    placeholder="https://your-next-big-thing.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    style={{
                      background: "#050506",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "0.45rem",
                      padding: "0.32rem 0.6rem",
                      fontSize: "0.72rem",
                      fontFamily: "var(--font-mono), monospace",
                      color: "#fff",
                      width: "185px",
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy || !ready}
                    onClick={() => void submit()}
                    className="ignite-scan-btn bg-white text-[#050506] hover:bg-zinc-200 font-medium px-6 py-2.5 rounded-lg shadow-[0_0_25px_rgba(255,255,255,0.18)] transition-all active:scale-[0.98]"
                    style={{ padding: "0.35rem 0.85rem", fontSize: "0.74rem" }}
                  >
                    <span>Ignite Scan</span>
                  </button>
                  <button
                    type="button"
                    onClick={resetStage}
                    className="action-btn"
                    style={{ padding: "0.35rem 0.65rem", fontSize: "0.72rem" }}
                  >
                    <X size={12} strokeWidth={1.5} aria-hidden="true" />
                    <span>Reset</span>
                  </button>
                </div>
              </motion.div>

              <div className="network-caption"><span className="led-dot emerald" /><span>{isActive ? "DISCOVERING YOUR SITE" : "YOUR SITE, CONNECTED"}</span><p>{isActive ? "Pages appear as your audit progresses." : "Select a page to explore its preview and page details."}</p></div>
              <div className="network-page-selector"><label htmlFor="network-page">Inspect page</label><select id="network-page" value={selectedNode || currentScan?.pages?.[0]?.page_url || ""} onChange={(e) => { setSelectedNode(e.target.value); setResultView("social"); }}><option value="" disabled>Discovering pages…</option>{(currentScan?.pages ?? []).map((page, i) => <option key={`${page.page_url}-${i}`} value={page.page_url}>{pathOf(page.page_url)}</option>)}</select></div>
              {/* Floating Right-Hand Smoked-Glass Inspector Deck */}
              <motion.aside
                initial={{ opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
                aria-label="Telemetry Inspector Deck"
                className="floating-right-inspector-deck w-full max-w-[420px] mr-6 my-auto bg-[#0A0B0E]/85 backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-6 z-20 shadow-2xl"
              >
                {isActive ? (
                  <div className="live-scan-panel"
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingBottom: "0.75rem",
                        marginBottom: "0.75rem",
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "0.68rem",
                        color: "#A1A1AA",
                        letterSpacing: "0.08em",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span className="led-dot emerald" aria-hidden="true" />
                        <span>LIVE TELEMETRY // {vibe.toUpperCase()}</span>
                      </span>
                      <span style={{ color: "#a1ad98" }}>LIVE</span>
                    </div>
                    <TerminalStream
                      scan={currentScan}
                      vibe={vibe}
                    />
                  </div>
                ) : detailLoading ? (
                  <div
                    style={{
                      padding: "3rem 1rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      fontFamily: "var(--font-mono), monospace",
                      fontSize: "0.76rem",
                      color: "#A1A1AA",
                    }}
                  >
                    <Loader2
                      size={15}
                      strokeWidth={1.5}
                      className="spin"
                      aria-hidden="true"
                    />
                    <span>Decrypting flight telemetry…</span>
                  </div>
                ) : currentScan?.status === "failed" ? (
                  /* Failed Scan Diagnostic Card */
                  <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    animate="show"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.9rem",
                    }}
                  >
                    <motion.div
                      variants={staggerItem}
                      style={{
                        padding: "1rem",
                        borderRadius: "0.75rem",
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontFamily: "var(--font-mono), monospace",
                          fontSize: "0.66rem",
                          color: "#A1A1AA",
                          letterSpacing: "0.08em",
                          marginBottom: 6,
                        }}
                      >
                        <span className="led-dot rose" aria-hidden="true" />
                        <span>FLIGHT ABORTED // TARGET UNREACHABLE</span>
                      </div>
                      <h3
                        style={{
                          fontSize: "0.95rem",
                          fontWeight: 500,
                          color: "#ffffff",
                          marginBottom: 6,
                        }}
                      >
                        {hostOf(currentScan.url)} Blocked or Timed Out
                      </h3>
                      <p style={{ fontSize: "0.78rem", color: "#A1A1AA" }}>
                        {currentScan.error ||
                          "Bot protection, WAF challenge, or strict origin rules rejected the probe."}
                      </p>
                    </motion.div>

                    <motion.div
                      variants={staggerItem}
                      style={{ display: "grid", gap: "0.5rem" }}
                    >
                      <button
                        type="button"
                        onClick={() => void submit(undefined, currentScan)}
                        className="action-btn primary"
                        style={{ width: "100%", padding: "0.65rem" }}
                      >
                        <RefreshCw size={13} strokeWidth={1.5} aria-hidden="true" />
                        <span>Retry with Stealth Headers</span>
                      </button>
                    </motion.div>

                    <motion.div
                      variants={staggerItem}
                      style={{ display: "flex", gap: 8 }}
                    >
                      <button
                        type="button"
                        onClick={() => void submit(undefined, currentScan)}
                        className="action-btn"
                        style={{ flex: 1 }}
                      >
                        <RefreshCw size={13} strokeWidth={1.5} aria-hidden="true" />
                        <span>Run again</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Delete scan"
                        disabled={busy}
                        onClick={() => void remove(currentScan)}
                        className="action-btn"
                      >
                        <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                      </button>
                    </motion.div>
                  </motion.div>
                ) : (
                  /* Completed Flight Manifest Deck with Staggered Reveal */
                  <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    animate="show"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <motion.div
                      variants={staggerItem}
                      className="manifest-score-banner"
                    >
                      <div>
                        <div
                          style={{
                            fontFamily: "var(--font-mono), monospace",
                            fontSize: "0.72rem",
                            color: "#94A3B8",
                            letterSpacing: "0.1em",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span>
                            02 // FLIGHT MANIFEST ·{" "}
                            {currentScan
                              ? hostOf(currentScan.url).toUpperCase()
                              : "READY"}
                          </span>
                          {isLocalRelay && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/20 border border-amber-500/40 text-amber-300">
                              [LOCAL RELAY]
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: "0.95rem",
                            fontWeight: 600,
                            color: "#FFFFFF",
                            marginTop: 4,
                          }}
                        >
                          <span
                            className={`led-dot ${
                              findings.length === 0 ? "emerald" : "silver"
                            }`}
                            aria-hidden="true"
                          />
                          <span>
                            {findings.length === 0
                              ? "Cleared for Launch"
                              : `${findings.length} Telemetry Anomalies`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span
                            data-testid="manifest-framework-badge"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-cyan-500/10 border border-cyan-500/30 text-cyan-300"
                          >
                            <Layers size={12} className="text-cyan-400" />
                            <span className="text-slate-400">FRAMEWORK:</span>
                            <span className="text-white font-semibold">
                              {!currentScan?.stack || currentScan.stack.toLowerCase() === "html" ? "Not identified" : stackDisplayName(currentScan.stack)}
                            </span>
                          </span>
                        </div>
                      </div>
                      <div
                        style={{
                          textAlign: "right",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          gap: 4,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                          <span
                            className="text-3xl font-bold text-white tracking-tight"
                            style={{ lineHeight: 1 }}
                          >
                            {computedScore}
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono), monospace",
                              fontSize: "0.82rem",
                              color: "#94A3B8",
                            }}
                          >
                            /100
                          </span>
                        </div>
                        <span
                          className={`manifest-health-pill ${
                            computedScore >= 85
                              ? "emerald"
                              : computedScore >= 60
                              ? "amber"
                              : "rose"
                          }`}
                        >
                          {computedScore >= 85
                            ? "EXCELLENT"
                            : computedScore >= 60
                            ? "ATTENTION"
                            : "CRITICAL"}
                        </span>
                      </div>
                    </motion.div>

                    {/* Score Delta & Comparison Banner */}
                    {previousScan && deltaScore !== null && (
                      <motion.div
                        variants={staggerItem}
                        className="mb-3 p-3 rounded-xl bg-slate-900/90 border border-slate-700/60 shadow-lg text-xs"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-mono text-slate-400 font-medium flex items-center gap-1.5">
                            <GitCompare size={13} className="text-slate-400" />
                            DELTA RUN VS {new Date(previousScan.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span
                            className={`font-mono font-bold text-sm ${
                              deltaScore >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {prevScoreVal} → {computedScore} ({deltaScore >= 0 ? "+" : ""}{deltaScore} pts)
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-300 pt-1 border-t border-slate-800">
                          <span className="flex items-center gap-1 text-emerald-400 font-medium">
                            <Check size={11} strokeWidth={2} />
                            {fixedRules.length} fixed issues
                          </span>
                          <span className="text-slate-600">·</span>
                          <span className="text-slate-400">
                            {findings.length} active issues
                          </span>
                        </div>
                      </motion.div>
                    )}

                    <div className="result-view-switch" role="group" aria-label="Report view">
                      <button type="button" aria-pressed={resultView === "findings"} onClick={() => setResultView("findings")}>Findings <span>{findings.length}</span></button>
                      <button type="button" aria-pressed={resultView === "social"} onClick={() => setResultView("social")}>Social previews <Share2 size={14} /></button>
                    </div>
                    {/* Multi-Platform Social Card Simulator */}
                    {currentScan && resultView === "social" && (
                      <motion.div
                        variants={staggerItem}
                        className="rounded-xl border border-white/10 bg-[#0E1118] overflow-hidden mb-3"
                      >
                        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-black/40 text-[11px] font-mono">
                          <span className="text-slate-300 font-semibold tracking-wider flex items-center gap-1.5">
                            <Sparkles size={11} className="text-emerald-400" />
                            SOCIAL CARD SIMULATOR
                          </span>
                          <span className="text-slate-500">
                            {currentScan.pages_scanned}/{currentScan.max_pages} PAGES
                          </span>
                        </div>

                        <div className="p-3">
                          {/* Platform Tabs */}
                          <div className="flex items-center gap-1 mb-3 bg-black/50 p-1 rounded-lg border border-white/5">
                            {(
                              [
                                { id: "x", label: "X (Twitter)" },
                                { id: "whatsapp", label: "WhatsApp" },
                                { id: "linkedin", label: "LinkedIn" },
                                { id: "imessage", label: "iMessage" },
                              ] as const
                            ).map((tab) => (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() => setSocialTab(tab.id)}
                                className={`flex-1 py-1 px-1.5 text-[11px] font-mono rounded font-medium transition-all ${
                                  socialTab === tab.id
                                    ? "bg-white/15 text-white shadow-sm"
                                    : "text-slate-400 hover:text-slate-200"
                                }`}
                              >
                                {tab.label}
                              </button>
                            ))}
                          </div>

                          {/* Naked Link Alert if missing og:image */}
                          {!hasSocialImage && (
                            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 mb-3">
                              <AlertTriangle size={14} className="text-rose-400 shrink-0" />
                              <span className="font-medium">
                                Naked Link Alert — No og:image found for{" "}
                                {socialTab === "x"
                                  ? "X (Twitter)"
                                  : socialTab === "whatsapp"
                                  ? "WhatsApp"
                                  : socialTab === "linkedin"
                                  ? "LinkedIn"
                                  : "iMessage"}
                              </span>
                            </div>
                          )}

                          {/* Platform Specific Preview */}
                          {socialTab === "x" && (
                            <div className="border border-zinc-800 rounded-xl overflow-hidden bg-black text-left">
                              {hasSocialImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={socialImage}
                                  alt="Card preview"
                                  className="w-full h-36 object-cover bg-zinc-900"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="w-full h-24 bg-zinc-900/60 flex items-center justify-center text-xs text-zinc-500 font-mono">
                                  [NO OG:IMAGE METATAG DETECTED]
                                </div>
                              )}
                              <div className="p-2.5">
                                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono block">
                                  {socialDomain}
                                </span>
                                <strong className="text-xs font-semibold text-zinc-100 block truncate mt-0.5">
                                  {socialTitle}
                                </strong>
                                <p className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5 leading-snug">
                                  {socialDesc}
                                </p>
                              </div>
                            </div>
                          )}

                          {socialTab === "whatsapp" && (
                            <div className="bg-[#0B1E17] border border-emerald-900/40 rounded-xl p-2.5 max-w-[95%] text-left">
                              {hasSocialImage && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={socialImage}
                                  alt="Card preview"
                                  className="w-full h-32 object-cover rounded-lg mb-2 bg-emerald-950/40"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              )}
                              <strong className="text-xs font-semibold text-emerald-100 block truncate">
                                {socialTitle}
                              </strong>
                              <p className="text-[11px] text-emerald-200/70 line-clamp-2 mt-0.5 leading-snug">
                                {socialDesc}
                              </p>
                              <span className="text-[10px] text-emerald-400/60 mt-1 block font-mono">
                                {socialDomain}
                              </span>
                            </div>
                          )}

                          {socialTab === "linkedin" && (
                            <div className="border border-slate-700/60 rounded-xl overflow-hidden bg-[#1B1F23] text-left">
                              {hasSocialImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={socialImage}
                                  alt="Card preview"
                                  className="w-full h-32 object-cover bg-slate-900"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="w-full h-24 bg-slate-900/60 flex items-center justify-center text-xs text-slate-500 font-mono">
                                  [NO OG:IMAGE METATAG DETECTED]
                                </div>
                              )}
                              <div className="p-2.5">
                                <strong className="text-xs font-semibold text-slate-100 block truncate">
                                  {socialTitle}
                                </strong>
                                <span className="text-[10px] text-slate-400 mt-0.5 block font-mono">
                                  {socialDomain}
                                </span>
                              </div>
                            </div>
                          )}

                          {socialTab === "imessage" && (
                            <div className="bg-[#1C1C1E] border border-white/10 rounded-2xl overflow-hidden p-2 max-w-[92%] text-left">
                              {hasSocialImage && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={socialImage}
                                  alt="Card preview"
                                  className="w-full h-32 object-cover rounded-xl mb-1.5 bg-zinc-900"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              )}
                              <div className="px-1 py-0.5">
                                <strong className="text-xs font-medium text-white block truncate">
                                  {socialTitle}
                                </strong>
                                <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                                  {socialDomain}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}

                    {resultView === "findings" && <>
                    {/* Page Fetch Errors */}
                    {pageErrors.length > 0 && (
                      <motion.div
                        variants={staggerItem}
                        style={{ marginBottom: "0.65rem" }}
                      >
                        {pageErrors.map((p, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 10,
                              padding: "0.75rem 0.85rem",
                              borderRadius: "0.6rem",
                              background: "rgba(244, 63, 94, 0.08)",
                              border: "1px solid rgba(244, 63, 94, 0.35)",
                              marginBottom: 6,
                            }}
                          >
                            <span
                              className="led-dot rose"
                              style={{ marginTop: 6 }}
                              aria-hidden="true"
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <code className="text-sm font-mono text-rose-400 font-semibold block break-all">
                                {p.page_url || p.source}
                              </code>
                              <span className="text-sm font-medium text-white block mt-1">
                                {p.error}
                              </span>
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    )}

                    {/* Findings Filter Header */}
                    <motion.div
                      variants={staggerItem}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 6,
                        marginBottom: "0.5rem",
                      }}
                    >
                      <h3
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          color: "#F8FAFC",
                        }}
                      >
                        Findings ({findings.length})
                      </h3>
                      <div style={{ display: "flex", gap: 6 }}>
                        <label className="sr-only" htmlFor="severity">
                          Filter by severity
                        </label>
                        <select
                          id="severity"
                          aria-label="Filter by severity"
                          value={severity}
                          onChange={(e) => { setSeverity(e.target.value); setFindingPage(0); }}
                          className="dark-select"
                        >
                          <option value="all">All</option>
                          <option value="warning">Warnings</option>
                          <option value="review">To review</option>
                        </select>

                        <label className="sr-only" htmlFor="category">
                          Filter by category
                        </label>
                        <select
                          id="category"
                          aria-label="Filter by category"
                          value={category}
                          onChange={(e) => { setCategory(e.target.value); setFindingPage(0); }}
                          className="dark-select"
                        >
                          <option value="all">All</option>
                          {categories.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </motion.div>

                    {/* Findings Scrollable List */}
                    <motion.div
                      variants={staggerItem}
                      style={{
                        overflow: "visible",
                        marginBottom: "0.75rem",
                        paddingRight: 4,
                      }}
                    >
                      {filtered.length > 0 ? (
                        visibleFindings.map((f, i) => (
                          <div
                            key={`${f.page}-${f.rule}-${i}`}
                            className="finding-card"
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <span
                                  className="led-dot silver"
                                  aria-hidden="true"
                                />
                                <strong className="text-base font-semibold text-white">
                                  {f.message}
                                </strong>
                              </span>
                              <span className="font-mono text-xs text-slate-400 uppercase tracking-wider flex-shrink-0">
                                {f.category}
                              </span>
                            </div>
                            <code className="text-sm font-mono text-emerald-400 block mt-1 break-all">
                              {f.page}
                            </code>
                            {f.recommendation && (
                              <p className="text-sm text-slate-200 leading-relaxed mt-1.5">
                                {f.recommendation}
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <p
                          style={{
                            fontSize: "0.85rem",
                            color: "#94A3B8",
                            textAlign: "center",
                            padding: "1.25rem 0",
                          }}
                        >
                          {findings.length
                            ? "No findings match these filters."
                            : "Zero anomalies detected across crawled pages."}
                        </p>
                      )}
                    </motion.div>

                    {findingPages > 1 && <div className="findings-pagination"><span>{visibleFindingPage * 3 + 1}–{Math.min((visibleFindingPage + 1) * 3, filtered.length)} of {filtered.length} findings</span><button type="button" disabled={visibleFindingPage === 0} onClick={() => setFindingPage(visibleFindingPage - 1)}>Previous</button><button type="button" disabled={visibleFindingPage === findingPages - 1} onClick={() => setFindingPage(visibleFindingPage + 1)}>Next</button></div>}
                    </>}
                    {/* Manifest Footer Action Buttons */}
                    {currentScan && (
                      <motion.div
                        variants={staggerItem}
                        style={{ display: "grid", gap: "0.5rem" }}
                      >
                        {/* Primary Button: Copy AI Prompt for Cursor / Claude */}
                        <button
                          type="button"
                          onClick={() => void copyAiPrompt(currentScan)}
                          className="action-btn primary"
                          style={{
                            width: "100%",
                            padding: "0.75rem 1rem",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                          }}
                        >
                          {copiedPrompt ? (
                            <>
                              <Check size={15} strokeWidth={2} />
                              <span>Prompt Copied! Paste in Cursor / Claude</span>
                            </>
                          ) : (
                            <>
                              <Sparkles size={15} strokeWidth={1.75} />
                              <span>Copy AI Fix Prompt (Cursor / Claude)</span>
                            </>
                          )}
                        </button>

                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            type="button"
                            onClick={() => void handleOpenShare(currentScan)}
                            className="action-btn"
                            style={{ flex: 1 }}
                          >
                            <Share2 size={13} strokeWidth={1.5} aria-hidden="true" />
                            <span>Share Report & Badge</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void copyFixList(currentScan)}
                            className="action-btn"
                            style={{ flex: 1 }}
                          >
                            <Copy size={13} strokeWidth={1.5} aria-hidden="true" />
                            <span>
                              {copyOk ? "Copied!" : "Copy Fix List (MD)"}
                            </span>
                          </button>
                        </div>

                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <a
                            href={`/api/scans/${currentScan.id}/export`}
                            download
                            className="action-btn"
                            style={{ flex: 1 }}
                          >
                            <ArrowDownToLine
                              size={13}
                              strokeWidth={1.5}
                              aria-hidden="true"
                            />
                            <span>Export JSON</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => void submit(undefined, currentScan)}
                            className="action-btn"
                            style={{ flex: 1 }}
                          >
                            <RefreshCw
                              size={13}
                              strokeWidth={1.5}
                              aria-hidden="true"
                            />
                            <span>Run again</span>
                          </button>
                          <button
                            type="button"
                            aria-label="Delete scan"
                            disabled={busy}
                            onClick={() => void remove(currentScan)}
                            className="action-btn"
                          >
                            <Trash2
                              size={14}
                              strokeWidth={1.5}
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </motion.aside>

              {/* Non-Overlapping Bottom-Left Smoked-Glass Node Inspector Pill */}
              <AnimatePresence>
                {selectedNode && (
                  <motion.div
                    key="node-inspector-pill"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
                    className="node-inspector-pill bottom-16 left-6 z-20"
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          color: "#71717A",
                          letterSpacing: "0.08em",
                          fontSize: "0.64rem",
                        }}
                      >
                        03 // NODE TELEMETRY
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedNode(null)}
                        aria-label="Close node inspector"
                        style={{ color: "#71717A" }}
                      >
                        <X size={12} strokeWidth={1.5} />
                      </button>
                    </div>
                    {(() => {
                      const pg = (currentScan?.pages ?? []).find(
                        (p) => (p.page_url || p.source) === selectedNode
                      );
                      const status = pg?.status_code ?? (pg?.error ? 404 : 200);
                      const loadMs = pg?.load_ms;
                      const isErr = status >= 400 || Boolean(pg?.error);
                      return (
                        <div style={{ display: "grid", gap: 4 }}>
                          <div
                            style={{
                              color: "#ffffff",
                              fontWeight: 500,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={selectedNode}
                          >
                            {selectedNode}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "center",
                              color: "#A1A1AA",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                color: "#F4F4F6",
                              }}
                            >
                              <span
                                className={`led-dot ${
                                  isErr ? "rose" : "emerald"
                                }`}
                                aria-hidden="true"
                              />
                              HTTP {status}
                            </span>
                            {loadMs !== undefined && <span>Fetch {loadMs}ms</span>}
                            <span>{pg?.findings.length ?? 0} issues</span>
                          </div>
                          {pg && pg.findings.length > 0 && (
                            <div
                              style={{
                                color: "#71717A",
                                fontSize: "0.64rem",
                              }}
                            >
                              Rules: {pg.findings.map((f) => f.rule).join(", ")}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Error Banner */}
        {error && (
          <div className="alert" role="alert">
            <span className="led-dot rose" aria-hidden="true" />
            <AlertTriangle size={15} strokeWidth={1.5} aria-hidden="true" />
            <span style={{ flex: 1 }}>{error}</span>
            <button
              type="button"
              onClick={() => {
                if (selected) void openScan(selected);
                else void refresh().catch(() => {});
              }}
              className="action-btn"
              style={{ padding: "0.25rem 0.65rem", fontSize: "0.72rem" }}
            >
              Try again
            </button>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
              style={{ color: "#A1A1AA" }}
            >
              <X size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        )}
      </main>

      {/* ── Bottom HUD Status Bar & Flight Recorder Drawer ── */}
      <footer className="bottom-telemetry-dock h-12 border-t border-white/[0.08] bg-[#050506]/90 backdrop-blur-xl px-6 flex items-center justify-between text-xs font-mono text-zinc-400 z-30">
        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
          <span
            className={`led-dot ${isActive ? "silver" : "emerald"}`}
            aria-hidden="true"
          />
          <span>
            {isActive
              ? "AUDIT IN PROGRESS · DISCOVERING YOUR PAGES"
              : "BUILT FOR BETTER FIRST IMPRESSIONS"}
          </span>
        </div>

        <div className="flight-dock-wrap" style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setDockOpen((v) => !v)}
            aria-expanded={dockOpen}
            aria-haspopup="true"
            className="flight-recorder-trigger"
          >
            <History size={12} strokeWidth={1.5} aria-hidden="true" />
            <span>SAVED AUDITS ({scans.length})</span>
            <span style={{ color: "#52525B" }}>·</span>
            <span style={{ color: "#A1A1AA" }}>Flight Logs</span>
          </button>

          <AnimatePresence>
            {dockOpen && (
              <motion.div
                className="flight-recorder-drawer"
                initial={{ opacity: 0, y: 12, x: "-50%" }}
                animate={{ opacity: 1, y: 0, x: "-50%" }}
                exit={{ opacity: 0, y: 12, x: "-50%" }}
                transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.85rem 1rem",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div>
                    <strong
                      style={{
                        display: "block",
                        fontSize: "0.76rem",
                        fontWeight: 500,
                        color: "#ffffff",
                      }}
                    >
                      FLIGHT RECORDER // SESSION ARCHIVE
                    </strong>
                    <span style={{ fontSize: "0.66rem", color: "#71717A" }}>
                      {scans.length} recorded telemetry runs · 1-click replay
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="Close flight logs"
                    onClick={() => setDockOpen(false)}
                    style={{ color: "#A1A1AA" }}
                  >
                    <X size={14} strokeWidth={1.5} />
                  </button>
                </div>

                <div style={{ padding: "0.65rem 1rem 0 1rem" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: "#050506",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "0.5rem",
                      padding: "0.4rem 0.65rem",
                    }}
                  >
                    <Search
                      size={13}
                      strokeWidth={1.5}
                      style={{ color: "#71717A" }}
                    />
                    <input
                      aria-label="Search scans"
                      placeholder="Filter recorded domains…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      style={{
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        color: "#fff",
                        fontSize: "0.74rem",
                        width: "100%",
                      }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    padding: "0.75rem 1rem",
                    overflowY: "auto",
                    display: "grid",
                    gap: "0.45rem",
                  }}
                >
                  {loading ? (
                    <div
                      style={{
                        padding: "1rem",
                        textAlign: "center",
                        color: "#71717A",
                      }}
                    >
                      Loading telemetry archive…
                    </div>
                  ) : shownScans.length === 0 ? (
                    <div
                      style={{
                        padding: "1.25rem",
                        textAlign: "center",
                        color: "#71717A",
                      }}
                    >
                      No recorded scans in this session yet.
                    </div>
                  ) : (
                    shownScans.map((s) => {
                      const sharesHost = Boolean(currentScan && hostOf(s.url) === hostOf(currentScan.url) && s.id !== currentScan.id);
                      return (
                        <div
                          key={s.id}
                          onClick={() => {
                            void openScan(s);
                            setDockOpen(false);
                          }}
                          className={`drawer-history-item ${
                            selected?.id === s.id ? "selected" : ""
                          }`}
                          style={{ cursor: "pointer" }}
                        >
                          <span
                            className={`led-dot ${
                              s.status === "completed"
                                ? "emerald"
                                : s.status === "failed"
                                ? "rose"
                                : "silver"
                            }`}
                            aria-hidden="true"
                          />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <strong
                              style={{
                                display: "block",
                                fontSize: "0.75rem",
                                fontWeight: 500,
                                color: "#F4F4F6",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {hostOf(s.url)}
                            </strong>
                            <small
                              style={{
                                display: "block",
                                fontSize: "0.64rem",
                                color: "#71717A",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {s.url} · {dateFmt(s.created_at)}
                            </small>
                          </span>

                          {s.stack && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 border border-white/10 text-slate-300 flex-shrink-0">
                              {stackDisplayName(s.stack)}
                            </span>
                          )}

                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex-shrink-0 ${
                              s.score !== undefined && s.score >= 85
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                : s.score !== undefined && s.score >= 60
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                            }`}
                          >
                            {s.score ?? "--"}/100
                          </span>

                          <span
                            style={{
                              fontSize: "0.66rem",
                              color: "#A1A1AA",
                              flexShrink: 0,
                            }}
                          >
                            {s.pages_scanned}/{s.max_pages}p
                          </span>

                          {sharesHost && (
                            <button
                              type="button"
                              title="Compare run"
                              onClick={(e) => {
                                e.stopPropagation();
                                setComparedScanId(comparedScanId === s.id ? null : s.id);
                              }}
                              className={`p-1 rounded border transition-colors flex-shrink-0 ${
                                comparedScanId === s.id
                                  ? "text-emerald-300 border-emerald-500/50 bg-emerald-500/20"
                                  : "text-slate-400 border-white/10 hover:bg-white/10"
                              }`}
                            >
                              <GitCompare size={12} strokeWidth={1.5} />
                            </button>
                          )}

                          <ChevronRight
                            size={13}
                            strokeWidth={1.5}
                            style={{ color: "#71717A", flexShrink: 0 }}
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div
          className="shortcut-legend"
          style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
        >
          <span>
            <kbd className="kbd-badge">[/]</kbd> Focus URL
          </span>
          <span>
            <kbd className="kbd-badge">[⌘↵]</kbd> Ignite
          </span>
          <span>
            <kbd className="kbd-badge">[ESC]</kbd> Reset Stage
          </span>
        </div>
      </footer>

      {/* ── Localhost Bridge CORS Modal ── */}
      <AnimatePresence>
        {localhostModal.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ zIndex: 9999, pointerEvents: "auto" }}
            className="launch-modal-overlay"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              role="dialog" aria-modal="true" aria-label="Audit options" tabIndex={-1} className="launch-modal-panel"
            >
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setLocalhostModal((m) => ({ ...m, open: false }))}
                className="absolute top-4 right-4 text-slate-400 hover:text-white"
              >
                <X size={16} strokeWidth={1.5} />
              </button>

              <div className="flex items-center gap-2 mb-2 font-mono text-xs text-amber-400 font-semibold tracking-wider">
                <AlertTriangle size={14} className="text-amber-400" />
                <span>LOCAL RELAY // CORS REQUIRED</span>
              </div>

              <h2 className="text-lg font-bold text-white mb-1">
                Localhost Bridge Setup
              </h2>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Direct browser requests to <code className="text-slate-300 font-mono">{localhostModal.targetUrl}</code> were blocked by browser CORS restrictions. Pick an option below to proceed:
              </p>

              {/* Modal Tabs */}
              <div className="flex border-b border-slate-800 mb-4">
                <button
                  type="button"
                  onClick={() => setLocalhostModal((m) => ({ ...m, tab: "tunnel" }))}
                  className={`pb-2 px-3 text-xs font-medium border-b-2 transition-all ${
                    localhostModal.tab === "tunnel"
                      ? "border-emerald-500 text-white font-semibold"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Option A: Instant Tunnel (Zero Config)
                </button>
                <button
                  type="button"
                  onClick={() => setLocalhostModal((m) => ({ ...m, tab: "cors" }))}
                  className={`pb-2 px-3 text-xs font-medium border-b-2 transition-all ${
                    localhostModal.tab === "cors"
                      ? "border-emerald-500 text-white font-semibold"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Option B: Dev Server CORS
                </button>
              </div>

              {localhostModal.tab === "tunnel" ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1.5">
                      1. Run Cloudflare Quick Tunnel in terminal:
                    </label>
                    <div className="flex items-center gap-2 bg-[#050506] border border-slate-800 rounded-lg p-2 font-mono text-xs">
                      <code className="text-emerald-400 flex-1 truncate">
                        npx cloudflared tunnel --url {localhostModal.targetUrl || "http://localhost:3000"}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            `npx cloudflared tunnel --url ${localhostModal.targetUrl || "http://localhost:3000"}`
                          );
                          setLocalhostModal((m) => ({ ...m, copiedTunnel: true }));
                          setTimeout(
                            () => setLocalhostModal((m) => ({ ...m, copiedTunnel: false })),
                            2000
                          );
                        }}
                        className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-sans text-slate-200 flex items-center gap-1"
                      >
                        {localhostModal.copiedTunnel ? <Check size={12} /> : <Copy size={12} />}
                        <span>{localhostModal.copiedTunnel ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1.5">
                      2. Paste generated tunnel URL:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="https://random-word.trycloudflare.com"
                        value={localhostModal.tunnelUrl}
                        onChange={(e) =>
                          setLocalhostModal((m) => ({ ...m, tunnelUrl: e.target.value }))
                        }
                        className="flex-1 bg-[#050506] border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        disabled={!localhostModal.tunnelUrl.trim()}
                        onClick={() => {
                          const tUrl = localhostModal.tunnelUrl.trim();
                          setUrl(tUrl);
                          setLocalhostModal((m) => ({ ...m, open: false }));
                          setTimeout(() => {
                            void submit();
                          }, 100);
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-all"
                      >
                        Ignite Scan
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-mono text-slate-400">
                        Next.js CORS Header Config (next.config.mjs):
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const snippet = `// next.config.mjs
export default {
  async headers() {
    return [{
      source: "/:path*",
      headers: [{ key: "Access-Control-Allow-Origin", value: "*" }]
    }];
  }
};`;
                          void navigator.clipboard.writeText(snippet);
                          setLocalhostModal((m) => ({ ...m, copiedSnippet: true }));
                          setTimeout(
                            () => setLocalhostModal((m) => ({ ...m, copiedSnippet: false })),
                            2000
                          );
                        }}
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-xs text-slate-200 flex items-center gap-1"
                      >
                        {localhostModal.copiedSnippet ? <Check size={11} /> : <Copy size={11} />}
                        <span>{localhostModal.copiedSnippet ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                    <pre className="bg-[#050506] border border-slate-800 rounded-lg p-2.5 font-mono text-[11px] text-slate-300 overflow-x-auto leading-relaxed">
{`async headers() {
  return [{
    source: "/:path*",
    headers: [{ key: "Access-Control-Allow-Origin", value: "*" }]
  }];
}`}
                    </pre>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLocalhostModal((m) => ({ ...m, open: false }));
                        void submit();
                      }}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                    >
                      <RefreshCw size={13} />
                      <span>Retry Local Relay Scan</span>
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Share Report & Badge Modal ── */}
      <AnimatePresence>
        {shareModal.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ zIndex: 9999, pointerEvents: "auto" }}
            className="launch-modal-overlay"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              role="dialog" aria-modal="true" aria-label="Audit options" tabIndex={-1} className="launch-modal-panel"
            >
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setShareModal((m) => ({ ...m, open: false }))}
                className="absolute top-4 right-4 text-slate-400 hover:text-white"
              >
                <X size={16} strokeWidth={1.5} />
              </button>

              <div className="flex items-center gap-2 mb-2 font-mono text-xs text-emerald-400 font-semibold tracking-wider">
                <ShieldCheck size={14} className="text-emerald-400" />
                <span>VERIFIED FLIGHT MANIFEST // SHARE</span>
              </div>

              <h2 className="text-lg font-bold text-white mb-1">
                Share Report & Live Badge
              </h2>

              {shareModal.loading ? (
                <div className="py-8 flex flex-col items-center justify-center gap-3 text-slate-400 text-xs font-mono">
                  <Loader2 size={24} className="spin text-emerald-400" />
                  <span>Generating permanent verified share link…</span>
                </div>
              ) : shareModal.error ? (
                <div className="my-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertTriangle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-semibold mb-0.5 text-white">Share Verification Error</strong>
                    <span>{shareModal.error}</span>
                  </div>
                </div>
              ) : shareModal.shareUrl ? (
                <div className="space-y-4 my-2">
                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1.5">
                      Public Report URL:
                    </label>
                    <div className="flex items-center gap-2 bg-[#050506] border border-slate-800 rounded-lg p-2 font-mono text-xs">
                      <input
                        readOnly
                        value={shareModal.shareUrl}
                        className="bg-transparent flex-1 text-emerald-400 truncate outline-none select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(shareModal.shareUrl);
                          setShareModal((m) => ({ ...m, copiedLink: true }));
                          setTimeout(
                            () => setShareModal((m) => ({ ...m, copiedLink: false })),
                            2000
                          );
                        }}
                        className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-sans text-slate-200 flex items-center gap-1"
                      >
                        {shareModal.copiedLink ? <Check size={12} /> : <Copy size={12} />}
                        <span>{shareModal.copiedLink ? "Copied" : "Copy"}</span>
                      </button>
                      <a
                        href={shareModal.shareUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 text-slate-400 hover:text-white"
                        title="Open report"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-slate-400 mb-1.5">
                      Live README Markdown Badge:
                    </label>
                    <div className="flex items-center gap-2 bg-[#050506] border border-slate-800 rounded-lg p-2 font-mono text-xs">
                      <input
                        readOnly
                        value={`[![Launch Ready](${shareModal.badgeUrl})](${shareModal.shareUrl})`}
                        className="bg-transparent flex-1 text-slate-300 truncate outline-none select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            `[![Launch Ready](${shareModal.badgeUrl})](${shareModal.shareUrl})`
                          );
                          setShareModal((m) => ({ ...m, copiedBadge: true }));
                          setTimeout(
                            () => setShareModal((m) => ({ ...m, copiedBadge: false })),
                            2000
                          );
                        }}
                        className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-sans text-slate-200 flex items-center gap-1"
                      >
                        {shareModal.copiedBadge ? <Check size={12} /> : <Copy size={12} />}
                        <span>{shareModal.copiedBadge ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                    {shareModal.badgeUrl && (
                      <div className="mt-2.5 flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-500 uppercase">Preview:</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={shareModal.badgeUrl}
                          alt="Launch Ready Badge"
                          className="h-5"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}

/* ── True 60fps Full-Viewport HTML5 <canvas> Force-Directed Physics Engine ── */
type SimNode = {
  id: string;
  url: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  radius: number;
  currentRadius: number;
  status: "ok" | "warn" | "error" | "root";
  isRoot?: boolean;
};

type AmbientParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  tag: string;
};

type LightPacket = {
  edgeIndex: number;
  progress: number;
  speed: number;
};

type OrbitalShockwave = {
  r: number;
  maxR: number;
  speed: number;
  alpha: number;
  color: string;
};

function ViewportPhysicsCanvas({
  isIdle,
  isActive,
  scan,
  selectedNode,
  onSelectNode,
}: {
  isIdle: boolean;
  isActive: boolean;
  scan: Scan | null;
  selectedNode: string | null;
  onSelectNode: (url: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(preference.matches);
    sync();
    preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);
  const mouseRef = useRef<{ x: number; y: number; down: boolean }>({
    x: -9999,
    y: -9999,
    down: false,
  });
  const draggedNodeIdRef = useRef<string | null>(null);
  const hoveredNodeIdRef = useRef<string | null>(null);
  const simNodesRef = useRef<SimNode[]>([]);
  const ambientRef = useRef<AmbientParticle[]>([]);
  const packetsRef = useRef<LightPacket[]>([]);
  const shockwavesRef = useRef<OrbitalShockwave[]>([]);
  const lastPulseTimeRef = useRef<number>(0);
  const prevCountRef = useRef<number>(0);
  const selectedNodeRef = useRef<string | null>(selectedNode);
  const isIdleRef = useRef<boolean>(isIdle);
  const isActiveRef = useRef<boolean>(isActive);

  useEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);

  useEffect(() => {
    isIdleRef.current = isIdle;
  }, [isIdle]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // Synchronize crawled pages with Hooke's Law / Coulomb force-directed nodes
  useEffect(() => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    const w = bounds?.width || 1440;
    const h = bounds?.height || 812;
    const anchorX = w <= 800 ? w * 0.5 : w * 0.30;
    const anchorY = w <= 800 ? Math.min(270, h * 0.55) : h * 0.5;

    const pages = scan?.pages ?? [];

    const rootUrl = scan?.url || "https://your-next-big-thing.com";
    const existing = new Map(simNodesRef.current.map((n) => [n.id, n]));

    const rootExisting = existing.get(rootUrl);
    const nextNodes: SimNode[] = [
      {
        id: rootUrl,
        url: rootUrl,
        label: hostOf(rootUrl),
        x: rootExisting ? rootExisting.x : anchorX,
        y: rootExisting ? rootExisting.y : anchorY,
        vx: rootExisting ? rootExisting.vx : 0,
        vy: rootExisting ? rootExisting.vy : 0,
        targetX: anchorX,
        targetY: anchorY,
        radius: 20,
        currentRadius: rootExisting ? rootExisting.currentRadius : 20,
        status: "root",
        isRoot: true,
      },
    ];

    const count = Math.max(pages.length, 1);
    pages.forEach((p, idx) => {
      const u = p.page_url || p.source || `page-${idx}`;
      const angle = (idx / count) * Math.PI * 2 - Math.PI / 2;
      const orbit = w <= 800 ? Math.min(75, h * 0.22) + (idx % 2) * 15 : 145 + (idx % 2) * 48;
      const tx = anchorX + Math.cos(angle) * orbit;
      const ty = anchorY + Math.sin(angle) * orbit;
      const isErr =
        Boolean(p.error) || (p.status_code !== null && p.status_code >= 400);
      const isWarn = !isErr && p.findings.length > 0;
      const prev = existing.get(u);

      nextNodes.push({
        id: u,
        url: u,
        label: pathOf(u),
        // Spawn from root and bloom outward via spring physics
        x: prev ? prev.x : anchorX + (Math.random() - 0.5) * 16,
        y: prev ? prev.y : anchorY + (Math.random() - 0.5) * 16,
        vx: prev ? prev.vx : Math.cos(angle) * 4.5,
        vy: prev ? prev.vy : Math.sin(angle) * 4.5,
        targetX: tx,
        targetY: ty,
        radius: 12,
        currentRadius: prev ? prev.currentRadius : 12,
        status: isErr ? "error" : isWarn ? "warn" : "ok",
      });
    });

    simNodesRef.current = nextNodes;

    // Trigger expanding emerald shockwave pulse when new pages are discovered
    if (pages.length > prevCountRef.current) {
      shockwavesRef.current.push({
        r: 22,
        maxR: 320,
        speed: 3.5,
        alpha: 0.75,
        color: "rgba(16, 185, 129, ALPHA)",
      });
    }
    prevCountRef.current = pages.length;

    // Initialize 3 fluid travelling light packets per edge
    packetsRef.current = nextNodes.slice(1).flatMap((_, i) => [
      {
        edgeIndex: i + 1,
        progress: (i * 0.31) % 1,
        speed: 0.0055 + (i % 3) * 0.0014,
      },
      {
        edgeIndex: i + 1,
        progress: ((i * 0.31) + 0.33) % 1,
        speed: 0.0055 + (i % 3) * 0.0014,
      },
      {
        edgeIndex: i + 1,
        progress: ((i * 0.31) + 0.66) % 1,
        speed: 0.0055 + (i % 3) * 0.0014,
      },
    ]);
  }, [scan]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Update root anchor & orbital equilibrium targets on resize
      const nodes = simNodesRef.current;
      if (nodes.length > 0) {
        const ax = width <= 800 ? width * 0.5 : width * 0.30;
        const ay = width <= 800 ? Math.min(270, height * 0.55) : height * 0.5;
        nodes[0].targetX = ax;
        nodes[0].targetY = ay;
        const childCount = Math.max(nodes.length - 1, 1);
        for (let i = 1; i < nodes.length; i++) {
          const angle = ((i - 1) / childCount) * Math.PI * 2 - Math.PI / 2;
          const orbit = width <= 800 ? Math.min(75, height * 0.22) + ((i - 1) % 2) * 15 : 145 + ((i - 1) % 2) * 48;
          nodes[i].targetX = ax + Math.cos(angle) * orbit;
          nodes[i].targetY = ay + Math.sin(angle) * orbit;
        }
      }
    };

    resize();
    if (reducedMotion) for (const node of simNodesRef.current) { node.x = node.targetX; node.y = node.targetY; }

    // Initialize 28 ambient silver constellation nodes
    if (ambientRef.current.length === 0) {
      ambientRef.current = Array.from({ length: 28 }, (_, i) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: i % 4 === 0 ? 2 : 1.3,
        tag: `0${(i % 9) + 1}`,
      }));
    }

    const onMouseMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;

      if (draggedNodeIdRef.current) {
        const node = simNodesRef.current.find(
          (n) => n.id === draggedNodeIdRef.current
        );
        if (node) {
          node.x = e.clientX - rect.left;
          node.y = e.clientY - rect.top;
          node.vx = 0;
          node.vy = 0;
        }
      }
    };

    const onMouseDown = (e: PointerEvent) => {
      if (e.target !== canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (isIdleRef.current) return;
      mouseRef.current.down = true;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      for (const node of simNodesRef.current) {
        const dx = mx - node.x;
        const dy = my - node.y;
        if (Math.hypot(dx, dy) <= node.currentRadius + 14) {
          draggedNodeIdRef.current = node.id;
          onSelectNode(node.url);
          break;
        }
      }
    };

    const onMouseUp = () => {
      mouseRef.current.down = false;
      draggedNodeIdRef.current = null;
    };

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMouseMove);
    window.addEventListener("pointerdown", onMouseDown);
    window.addEventListener("pointerup", onMouseUp);

    let rafId = 0;
    const SPRING_K = 0.035;
    const REPULSION = 3800;
    const DAMPING = 0.905;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const parX = mx > 0 ? (mx - width * 0.5) * 0.012 : 0;
      const parY = my > 0 ? (my - height * 0.5) * 0.012 : 0;
      const time = reducedMotion ? 0 : performance.now() * 0.0016;

      // 1. Always render subtle drifting ambient constellation in background
      const amb = ambientRef.current;
      for (let i = 0; i < amb.length; i++) {
        const p = amb[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        const px = p.x + parX;
        const py = p.y + parY;

        for (let j = i + 1; j < amb.length; j++) {
          const q = amb[j];
          const qx = q.x + parX;
          const qy = q.y + parY;
          const dist = Math.hypot(px - qx, py - qy);
          if (dist < 165) {
            const alpha = (1 - dist / 165) * 0.05;
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(qx, qy);
            ctx.stroke();
          }
        }

        ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
        ctx.beginPath();
        ctx.arc(px, py, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. In Active Scan & Results Mode: Run Hooke's Law + Coulomb repulsion + 0.905 damping
      if (!isIdleRef.current && simNodesRef.current.length > 0) {
        const nodes = simNodesRef.current;
        const root = nodes[0];

        // Periodic shockwave pulses when scan is active
        if (isActiveRef.current) {
          const now = performance.now();
          if (now - lastPulseTimeRef.current > 1100) {
            lastPulseTimeRef.current = now;
            shockwavesRef.current.push({
              r: root.currentRadius + 4,
              maxR: 320,
              speed: 3.0,
              alpha: 0.65,
              color: "rgba(16, 185, 129, ALPHA)",
            });
          }
        }

        // Render expanding orbital shockwaves
        const shockwaves = shockwavesRef.current;
        for (let sIdx = shockwaves.length - 1; sIdx >= 0; sIdx--) {
          const sw = shockwaves[sIdx];
          sw.r += sw.speed;
          const life = Math.max(0, 1 - sw.r / sw.maxR);
          if (life <= 0) {
            shockwaves.splice(sIdx, 1);
            continue;
          }
          ctx.save();
          ctx.strokeStyle = sw.color.replace("ALPHA", (sw.alpha * life).toFixed(3));
          ctx.lineWidth = Math.max(1, 2.4 * life);
          ctx.beginPath();
          ctx.arc(root.x, root.y, sw.r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Subtle orbital telemetry range rings anchored at root
        [85, 160, 235].forEach((r) => {
          ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 6]);
          ctx.beginPath();
          ctx.arc(root.x, root.y, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        });

        let hoveredId: string | null = null;

        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const isDragged = draggedNodeIdRef.current === n.id;

          if (!isDragged) {
            // Gentle organic breathing harmonic oscillation
            const breathX = Math.sin(time + i * 1.1) * 1.5;
            const breathY = Math.cos(time * 0.88 + i * 1.3) * 1.5;

            // Hooke's Law spring attraction toward orbital equilibrium
            let fx = (n.targetX + breathX - n.x) * SPRING_K;
            let fy = (n.targetY + breathY - n.y) * SPRING_K;

            // Coulomb repulsion between sibling nodes
            for (let j = 0; j < nodes.length; j++) {
              if (i === j) continue;
              const other = nodes[j];
              const dx = n.x - other.x;
              const dy = n.y - other.y;
              const distSq = Math.max(dx * dx + dy * dy, 240);
              if (distSq < 24000) {
                const dist = Math.sqrt(distSq);
                const rep = REPULSION / distSq;
                fx += (dx / dist) * rep;
                fy += (dy / dist) * rep;
              }
            }

            // Interactive Cursor Gravity when hovering within 170px
            const cdx = mx - n.x;
            const cdy = my - n.y;
            const cDist = Math.hypot(cdx, cdy);
            if (cDist < 170 && cDist > 0) {
              const pull = (1 - cDist / 170) * 0.042;
              fx += cdx * pull;
              fy += cdy * pull;
            }
            if (cDist <= n.currentRadius + 14) {
              hoveredId = n.id;
            }

            n.vx = (n.vx + fx) * DAMPING;
            n.vy = (n.vy + fy) * DAMPING;
            n.x += n.vx;
            n.y += n.vy;
          } else {
            hoveredId = n.id;
          }

          const isSelected = selectedNodeRef.current === n.url;
          const isHovered = hoveredId === n.id;
          const desiredR =
            n.radius + (isHovered ? 4.5 : 0) + (isSelected ? 2.5 : 0);
          n.currentRadius += (desiredR - n.currentRadius) * 0.18;
        }

        // Elastic node collision buffer: prevent overlapping nodes
        for (let i = 0; i < nodes.length; i++) {
          const n1 = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const n2 = nodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.hypot(dx, dy) || 1;
            const minDist = n1.currentRadius + n2.currentRadius + 28;
            if (dist < minDist) {
              const overlap = 0.5 * (minDist - dist);
              const nx = dx / dist;
              const ny = dy / dist;
              if (draggedNodeIdRef.current !== n1.id) {
                n1.x -= nx * overlap * 0.5;
                n1.y -= ny * overlap * 0.5;
              }
              if (draggedNodeIdRef.current !== n2.id) {
                n2.x += nx * overlap * 0.5;
                n2.y += ny * overlap * 0.5;
              }
            }
          }
        }

        // Viewport boundaries: keep nodes safely in view avoiding overlays
        const minX = 70;
        const maxX = width <= 800 ? width - 55 : Math.max(200, width - 570);
        const minY = width <= 800 ? Math.min(170, height * 0.2) : 85;
        const maxY = height - 40;

        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          if (n.x < minX) { n.x = minX; n.vx *= -0.3; }
          if (n.x > maxX) { n.x = maxX; n.vx *= -0.3; }
          if (n.y < minY) { n.y = minY; n.vy *= -0.3; }
          if (n.y > maxY) { n.y = maxY; n.vy *= -0.3; }
        }

        hoveredNodeIdRef.current = hoveredId;
        canvas.style.cursor = hoveredId ? "pointer" : "default";

        // Draw hairline vector links from root to child nodes
        for (let i = 1; i < nodes.length; i++) {
          const child = nodes[i];
          const isSelected = selectedNodeRef.current === child.url;
          ctx.strokeStyle = isSelected
            ? "rgba(255, 255, 255, 0.42)"
            : "rgba(255, 255, 255, 0.12)";
          ctx.lineWidth = isSelected ? 1.75 : 1;
          ctx.beginPath();
          ctx.moveTo(root.x, root.y);
          ctx.lineTo(child.x, child.y);
          ctx.stroke();
        }

        // Draw Travelling Light Packets (2.5px cyan-silver beads with motion trails)
        for (const pkt of packetsRef.current) {
          const target = nodes[pkt.edgeIndex];
          if (!target) continue;
          pkt.progress = (pkt.progress + pkt.speed) % 1;
          const t = pkt.progress;
          const lx = root.x + (target.x - root.x) * t;
          const ly = root.y + (target.y - root.y) * t;
          const tailT = Math.max(0, t - 0.12);
          const tx = root.x + (target.x - root.x) * tailT;
          const ty = root.y + (target.y - root.y) * tailT;

          const grad = ctx.createLinearGradient(tx, ty, lx, ly);
          grad.addColorStop(0, "rgba(165, 243, 252, 0)");
          grad.addColorStop(0.65, "rgba(165, 243, 252, 0.4)");
          grad.addColorStop(1, "rgba(255, 255, 255, 0.95)");
          ctx.strokeStyle = grad;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(lx, ly);
          ctx.stroke();

          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw Nodes (Enlarged Monochromatic Titanium bodies + Micro-LED cores)
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const isSelected = selectedNodeRef.current === n.url;
          const isHovered = hoveredId === n.id;

          // Interactive magnetic hover aura
          const cdx = mx - n.x;
          const cdy = my - n.y;
          const cDist = Math.hypot(cdx, cdy);
          if (cDist < 170 && !n.isRoot) {
            const auraAlpha = (1 - cDist / 170) * 0.18;
            ctx.strokeStyle = `rgba(165, 243, 252, ${auraAlpha.toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.currentRadius + 10, 0, Math.PI * 2);
            ctx.stroke();
          }

          // Soft silver halo ring on Root or Selected or Hovered node
          if (n.isRoot || isSelected || isHovered) {
            ctx.strokeStyle = isSelected
              ? "rgba(255, 255, 255, 0.42)"
              : "rgba(255, 255, 255, 0.15)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.currentRadius + 8, 0, Math.PI * 2);
            ctx.stroke();
          }

          // Pulsing warning ring on error / 404 nodes
          if (n.status === "error") {
            const pulseRadius = n.currentRadius + 6 + Math.sin(time * 6) * 3;
            ctx.save();
            ctx.strokeStyle = "rgba(244, 63, 94, 0.75)";
            ctx.lineWidth = 1.75;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(n.x, n.y, Math.max(pulseRadius, n.currentRadius + 2), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          // Solid Elevated Node Shell (#131722) with Color-Coded Rim
          const nodeColor =
            n.status === "error"
              ? "#F43F5E"
              : n.status === "warn"
              ? "#F59E0B"
              : n.isRoot
              ? "#FFFFFF"
              : "#10B981";

          ctx.fillStyle = "#131722";
          ctx.strokeStyle = isSelected ? "#FFFFFF" : nodeColor;
          ctx.lineWidth = isSelected ? 2.5 : 1.75;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.currentRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Micro-LED Status Core
          ctx.fillStyle = nodeColor;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.isRoot ? 5.5 : 4, 0, Math.PI * 2);
          ctx.fill();

          // Bold 14px JetBrains Mono Label with Solid Dark Pill Backdrop (#0B0E14 with slate border)
          const labelFont = n.isRoot
            ? 'bold 15px "JetBrains Mono", monospace'
            : 'bold 14px "JetBrains Mono", monospace';
          ctx.font = labelFont;
          const textMetrics = ctx.measureText(n.label);
          const textWidth = textMetrics.width;
          const padX = 8;
          const pillH = 22;
          const pillX = n.x - textWidth / 2 - padX;
          const pillY = n.y + n.currentRadius + 10;

          // Draw solid pill background
          ctx.fillStyle = "#0B0E14";
          ctx.strokeStyle = isSelected ? "#10B981" : "#334155";
          ctx.lineWidth = isSelected ? 1.5 : 1;
          ctx.beginPath();
          if (typeof ctx.roundRect === "function") {
            ctx.roundRect(pillX, pillY, textWidth + padX * 2, pillH, 6);
          } else {
            ctx.rect(pillX, pillY, textWidth + padX * 2, pillH);
          }
          ctx.fill();
          ctx.stroke();

          // Draw pure white text
          ctx.fillStyle = "#FFFFFF";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(n.label, n.x, pillY + pillH / 2);
        }
      }

      if (!reducedMotion) rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMouseMove);
      window.removeEventListener("pointerdown", onMouseDown);
      window.removeEventListener("pointerup", onMouseUp);
    };
  }, [onSelectNode, reducedMotion, scan, selectedNode]);

  return (
    <canvas
      ref={canvasRef}
      className={`physics-canvas fixed inset-0 z-10 ${isActive ? "scan-rumble" : ""}`}
      style={{ pointerEvents: isIdle ? "none" : "auto" }}
      aria-label="Full-viewport interactive telemetry physics graph"
    />
  );
}

function TerminalStream({
  scan,
  vibe,
}: {
  scan: Scan | null;
  vibe: Vibe;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const vl = vibeLines[vibe];
    const queue: string[] = [vl.start];
    const pages = scan?.pages ?? [];

    pages.forEach((p) => {
      if (p.error) queue.push(`${vl.fail} (${p.page_url})`);
      else {
        queue.push(vl.page(p.page_url));
        p.findings.forEach((f) => queue.push(vl.warn(f.message)));
      }
    });
    if (scan?.status === "completed") queue.push(vl.done);
    if (scan?.status === "failed" && scan.error) queue.push(`${vl.fail} — ${scan.error}`);

    setLines([queue[0]]);
    let idx = 1;
    const timer = setInterval(() => {
      if (idx >= queue.length) {
        clearInterval(timer);
        return;
      }
      const nextLine = queue[idx++];
      if (nextLine) setLines((prev) => [...prev, nextLine]);
    }, 260);
    return () => clearInterval(timer);
  }, [scan, vibe]);

  useEffect(() => {
    containerRef.current?.scrollTo(0, containerRef.current.scrollHeight);
  }, [lines]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflow: "hidden",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
      }}
    >
      {lines.slice(-3).map((line, i) => {
        const isErr =
          line.includes("REFUSED") ||
          line.includes("rejected") ||
          line.includes("unreachable");
        const isWarn =
          line.includes("VIOLATION") ||
          line.includes("Critique") ||
          line.includes("Notice");
        return (
          <div key={`${i}-${line.slice(0, 18)}`} className="terminal-log-row">
            <span
              className={`led-dot ${
                isErr ? "rose" : isWarn ? "silver" : "emerald"
              }`}
              aria-hidden="true"
            />
            <span style={{ color: "#71717A", fontSize: "0.66rem" }}>
              {String(Math.max(0, lines.length - 3) + i + 1).padStart(2, "0")}
            </span>
            <span style={{ flex: 1 }}>{line}</span>
          </div>
        );
      })}
    </div>
  );
}
