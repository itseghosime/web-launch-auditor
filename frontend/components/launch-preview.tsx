"use client";

import { useState } from "react";
import { ArrowUpRight, Check, Code, GitCompare, Globe, Layers, Link2, MessageCircle, ShieldCheck, Sparkles, Terminal } from "lucide-react";

const platforms = ["X / Twitter", "LinkedIn", "WhatsApp", "iMessage"] as const;

export function LaunchPreview() {
  const [platform, setPlatform] = useState<(typeof platforms)[number]>("X / Twitter");
  return (
    <section className="launch-preview" aria-label="Illustrative social preview">
      <div className="preview-grid" aria-hidden="true" />
      <div className="preview-coordinate coordinate-top">FIG. 01 — A BETTER FIRST IMPRESSION</div>
      <svg className="preview-orbits" viewBox="0 0 600 500" fill="none" aria-hidden="true">
        <ellipse cx="300" cy="260" rx="255" ry="180" transform="rotate(-28 300 260)" />
        <ellipse cx="300" cy="260" rx="210" ry="240" transform="rotate(30 300 260)" />
        <path d="M40 140L185 240L510 370M85 400L300 260L500 80" strokeDasharray="3 6" />
        <circle cx="65" cy="170" r="5" /><circle cx="510" cy="370" r="5" /><circle cx="500" cy="80" r="5" />
      </svg>
      <div className="preview-score"><span className="score-ring">98</span><div><strong>Ready for the spotlight.</strong><span>Example launch score <Check size={12} /></span></div><Sparkles size={18} /></div>
      <div className={`sample-browser sample-${platform.split(" ")[0].toLowerCase()}`}>
        <div className="sample-browser-bar"><div className="window-dots"><i /><i /><i /></div><span><Globe size={11} /> your-next-big-thing.com</span><ArrowUpRight size={13} /></div>
        <div className="sample-art"><span className="sample-wordmark">orbit®</span><span className="sample-edition">MADE TO GO PLACES.</span><div className="orbit-sculpture" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div><div className="sample-art-title">Small idea.<br />Infinite possibilities<span>↗</span></div><span className="sample-art-bottom">YOUR NEXT CHAPTER STARTS HERE</span></div>
        <div className="sample-meta"><span>YOUR-NEXT-BIG-THING.COM</span><strong>A little ambition goes a long way.</strong><p>Meet your next big thing. Thoughtfully built. Ready to share.</p></div>
      </div>
      <div className="preview-check"><span><Check size={14} /></span><div><strong>Looking good everywhere.</strong><span>Open Graph metadata, checked.</span></div></div>
      <div className="preview-platforms" aria-label="Example social platform">{platforms.map((name) => <button key={name} type="button" onClick={() => setPlatform(name)} aria-pressed={platform === name}>{name === "WhatsApp" ? <MessageCircle size={12} /> : null}{name}</button>)}</div>
      <div className="preview-coordinate coordinate-bottom"><span>ILLUSTRATIVE PREVIEW</span><span>DESIGNED TO BE SHARED ↗</span></div>
    </section>
  );
}

const features = [
  { icon: Globe, name: "Make every link count.", tag: "METADATA & SOCIAL", body: "Titles, descriptions, canonicals, and social cards. See your first impression before everyone else does.", detail: "Preview X, LinkedIn, WhatsApp, and iMessage cards from your page’s Open Graph tags. Missing images and invalid social URLs are called out in your report.", className: "feature-social" },
  { icon: ShieldCheck, name: "Catch the easy-to-miss.", tag: "STRUCTURE & LAUNCH LEAKS", body: "Missing alt text. Empty links. That localhost URL you forgot. Small details, caught before launch.", detail: "Inspect document language, main headings, image alt attributes, local references, placeholder text, source-map hints, and empty or malformed anchors. These are HTML checks, not an accessibility certification.", className: "feature-checks" },
  { icon: Sparkles, name: "From found to fixed.", tag: "AI-READY FIX PROMPTS", body: "A clear fix list, ready for your editor. Copy the context into Cursor or Claude and get back to building.", detail: "Framework detection adds context to your report. Copy a structured AI prompt or a Markdown fix list, or export the full audit as JSON.", className: "feature-ai" },
];

export function FeatureOverview() {
  return <section className="feature-overview" id="capabilities" aria-labelledby="capabilities-title">
    <div className="feature-heading"><div><span className="section-kicker">MORE THAN A PRETTY PREVIEW</span><h2 id="capabilities-title">Your launch. Every little detail.</h2></div><span className="feature-heading-note">One URL. A clearer path to ship. <ArrowUpRight size={17} /></span></div>
    <div className="feature-grid">{features.map((feature, index) => <article className={`feature-tile ${feature.className}`} key={feature.name}>
      <div className="feature-tile-top"><feature.icon size={20} strokeWidth={1.5} /><span>0{index + 1}</span></div>
      <span className="feature-tag">{feature.tag}</span><h3>{feature.name}</h3><p>{feature.body}</p>
      <details><summary>Explore the checks <ArrowUpRight size={14} /></summary><p>{feature.detail}</p></details>
    </article>)}</div>
    <div className="workflow-strip">
      <div><Terminal size={18} /><strong>Start on localhost</strong><span>Browser relay + tunnel fallback</span></div>
      <div><Layers size={18} /><strong>Follow the whole story</strong><span>Up to 20 pages · 3 crawl levels</span></div>
      <div><GitCompare size={18} /><strong>See what improved</strong><span>Saved audits + score comparisons</span></div>
      <div><Link2 size={18} /><strong>Share your progress</strong><span>Public reports + embeddable badges</span></div>
    </div>
    <p className="scope-note"><Code size={13} /> HTML-based checks with evidence and suggested fixes. History stays with this browser session.</p>
  </section>;
}
