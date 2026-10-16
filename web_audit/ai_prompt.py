"""Build an AI fix prompt from a scan dict."""

STACK_LABELS = {
    "nextjs": "Next.js",
    "astro": "Astro",
    "remix": "Remix",
    "vite": "Vite",
    "wordpress": "WordPress",
    "webflow": "Webflow",
    "html": "HTML",
}


def _pages(scan):
    if isinstance(scan, dict):
        return scan.get("pages", []) or []
    return getattr(scan, "pages", []) or []


def build_ai_fix_prompt(scan):
    url = scan.get("url") if isinstance(scan, dict) else getattr(scan, "url", "")
    stack = (
        scan.get("stack", "html")
        if isinstance(scan, dict)
        else getattr(scan, "stack", "html")
    )
    score = (
        scan.get("score", 0) if isinstance(scan, dict) else getattr(scan, "score", 0)
    )
    stack_label = STACK_LABELS.get(stack, "HTML")
    lines = []
    lines.append("# Launch Auditor — AI Fix Prompt")
    lines.append("")
    lines.append(f"Target URL: {url}")
    lines.append(f"Detected Stack: {stack_label}")
    lines.append(f"Health Score: {score}/100")
    lines.append("")
    pages = _pages(scan)
    for page in pages:
        page_url = (
            page.get("page_url") or page.get("url")
            if isinstance(page, dict)
            else getattr(page, "url", "")
        )
        lines.append(f"## Page: {page_url}")
        for f in page.get("findings", []) if isinstance(page, dict) else []:
            rule = f.get("rule") if isinstance(f, dict) else getattr(f, "rule", "")
            message = (
                f.get("message") if isinstance(f, dict) else getattr(f, "message", "")
            )
            evidence = (
                f.get("evidence") if isinstance(f, dict) else getattr(f, "evidence", "")
            )
            recommendation = (
                f.get("recommendation")
                if isinstance(f, dict)
                else getattr(f, "recommendation", "")
            )
            lines.append(f"- **{rule}**: {message}")
            if evidence:
                lines.append(f"  - Evidence: {evidence}")
            if recommendation:
                lines.append(f"  - Fix: {recommendation}")
        lines.append("")
    if not any(p.get("findings") for p in pages if isinstance(p, dict)):
        lines.append("No findings — this page scored clean.")
        lines.append("")
    return "\n".join(lines).strip() + "\n"
