"""Framework/tech-stack detection for launch reports."""

MARKERS = (
    ("nextjs", ("_next/static", "__next_data__", "x-powered-by")),
    ("astro", ("astro-island", "astro")),
    ("remix", ("__remixcontext", "__remixmanifest")),
    ("vite", ("@vite/", "vite")),
    ("wordpress", ("/wp-content/", "/wp-includes/")),
    ("webflow", ("data-wf-page", "data-wf-site")),
)


def detect_stack(html, headers=None):
    lowered = (html or "").lower()
    hdrs = {}
    if headers:
        hdrs = {str(k).lower(): str(v) for k, v in headers.items()}
    powered = hdrs.get("x-powered-by", "").lower()
    if "next.js" in powered or "nextjs" in powered:
        return "nextjs"
    if "astro" in powered:
        return "astro"
    if "remix" in powered:
        return "remix"
    if href_contains(lowered, "_next/static") or "__next_data__" in lowered:
        return "nextjs"
    if "astro-island" in lowered or ("generator" in lowered and "astro" in lowered):
        return "astro"
    if "__remixcontext" in lowered or "__remixmanifest" in lowered:
        return "remix"
    if "@vite/" in lowered:
        return "vite"
    if '<div id="root"' in lowered or "<div id='root'" in lowered:
        # vite-ish root container; only treat as vite if module script present
        if 'type="module"' in lowered or "type='module'" in lowered:
            return "vite"
    if "/wp-content/" in lowered or "/wp-includes/" in lowered:
        return "wordpress"
    if "data-wf-page" in lowered or "data-wf-site" in lowered:
        return "webflow"
    if '<div id="app"' in lowered or "<div id='app'" in lowered:
        if 'type="module"' in lowered or "type='module'" in lowered:
            return "vite"
    return "html"


def href_contains(text, needle):
    return needle in text


def get_stack_recommendation(rule, stack, default_rec):
    base = default_rec or ""
    if stack == "nextjs" and rule in {"og:image.missing", "og:image.invalid"}:
        return (
            f"{base} For Next.js (App Router): export openGraph.images "
            "in app/layout.tsx metadata."
        ).strip()
    if stack == "wordpress" and rule == "title.missing":
        return (
            f"{base} For WordPress: set the title via your SEO plugin "
            "(Yoast/RankMath) or theme <title>."
        ).strip()
    return base
