"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  ExternalLink,
  Layers,
  Loader2,
} from "lucide-react";

type Finding = {
  rule: string;
  category: string;
  severity: string;
  message: string;
  evidence?: string;
  recommendation?: string;
  page?: string;
};

type PageData = {
  page_url?: string;
  source?: string;
  status_code?: number | null;
  findings: Finding[];
  error?: string | null;
  social_preview?: {
    title?: string;
    description?: string;
    image?: string;
    domain?: string;
  };
};

type ScanSnapshot = {
  id: string;
  url: string;
  status: string;
  created_at: string;
  score?: number;
  stack?: string;
  pages_scanned?: number;
  pages?: PageData[];
  findings?: Finding[];
  summary?: {
    score?: number;
    pages_scanned?: number;
    findings_count?: number;
    status?: string;
    verified?: boolean;
  };
};

export default function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [scan, setScan] = useState<ScanSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchReport() {
      try {
        const res = await fetch(`/api/reports/${id}`);
        if (!res.ok) throw new Error("Report not found");
        const data = await res.json();
        if (!cancelled) {
          setScan(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setScan(null);
          setLoading(false);
        }
      }
    }
    void fetchReport();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const homeLink = <Link href="/" className="report-cta">Audit your own site <ArrowRight size={16} /></Link>;
  if (loading) return <main className="report-state" aria-live="polite"><Loader2 className="spin" size={28} /><h1>Opening your launch report…</h1><p>Loading the saved audit snapshot.</p></main>;
  if (!scan) return <main className="report-state"><AlertTriangle size={32} /><h1>Report not found or expired.</h1><p>This link may have expired after 90 days. Run a new audit to create a fresh report.</p>{homeLink}</main>;

  const score = scan.score ?? scan.summary?.score;
  const findings: Finding[] = scan.findings?.length ? scan.findings : (scan.pages ?? []).flatMap((p) => (p.findings ?? []).map((f) => ({ ...f, page: p.page_url || p.source || scan.url })));
  let hostname = scan.url;
  try { hostname = new URL(scan.url).hostname; } catch { /* Display the supplied label. */ }
  const safeUrl = /^https?:\/\//i.test(scan.url) ? scan.url : undefined;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const badgeUrl = `${origin}/api/reports/${id}/badge.svg`;
  const shareUrl = `${origin}/r/${id}`;
  const preview = scan.pages?.find((p) => p.social_preview)?.social_preview;

  return <div className="public-report">
    <header className="report-header"><Link href="/" className="report-brand"><ShieldCheck size={23} /> launch<span>auditor.</span></Link><span>PUBLIC AUDIT SNAPSHOT</span>{homeLink}</header>
    <main className="report-content">
      <div className="report-intro"><span className="section-kicker">SAVED LAUNCH REPORT · {new Date(scan.created_at).toLocaleDateString()}</span><h1>{hostname} {safeUrl && <a href={safeUrl} target="_blank" rel="noopener noreferrer" aria-label="Open audited website"><ExternalLink size={20} /></a>}</h1><p>A snapshot of the details that make a better first impression.</p></div>
      <section className="report-summary" aria-label="Audit summary"><div><ShieldCheck size={30} /><h2>Your pre-launch check.</h2><p>{scan.pages_scanned ?? scan.summary?.pages_scanned ?? scan.pages?.length ?? 0} pages inspected{scan.stack ? ` · ${scan.stack}` : ""}</p></div><div className="report-score"><strong>{score ?? "—"}</strong><span>/100</span><p>{score === undefined ? "Score unavailable" : score >= 85 ? "Looking good" : score >= 60 ? "A few things to review" : "Needs attention"}</p></div></section>
      {preview && <section className="report-social"><span className="section-kicker">SOCIAL METADATA</span><h2>{preview.title || hostname}</h2><p>{preview.description || "No social description supplied."}</p></section>}
      <section className="report-findings"><div className="report-section-heading"><h2>What we found</h2><span>{findings.length} findings</span></div>{findings.length ? findings.map((f, i) => <article key={`${f.rule}-${i}`}><div><span className="report-category">{f.category} · {f.severity}</span><h3>{f.message}</h3></div>{f.page && <code>{f.page}</code>}{f.evidence && <p className="report-evidence">{typeof f.evidence === "string" ? f.evidence : JSON.stringify(f.evidence)}</p>}{f.recommendation && <p><strong>Suggested fix</strong> {f.recommendation}</p>}</article>) : <div className="report-clean"><CheckCircle2 size={20} /><p>No findings in the inspected HTML.</p></div>}</section>
      <section className="report-embed"><h2>Take your launch report with you.</h2><p>Add the badge to your README or share this report with your team.</p><code>{`[![Launch Auditor](${badgeUrl})](${shareUrl})`}</code></section>
      <section className="report-bottom"><Sparkles size={24} /><h2>Make your first impression count.</h2><p>Metadata, social previews, structure, and launch leaks. One clear report.</p>{homeLink}</section>
      <p className="report-note">HTML checks are a point-in-time snapshot, not a certification of security, performance, or accessibility.</p>
    </main>
  </div>;
}
