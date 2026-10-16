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
    server = hdrs.get("server", "").lower()

    # 1. Header signatures
    if "next.js" in powered or "nextjs" in powered:
        return "nextjs"
    if "astro" in powered:
        return "astro"
    if "remix" in powered:
        return "remix"
    if "nuxt" in powered:
        return "nuxt"
    if "gatsby" in powered:
        return "gatsby"
    if "shopify" in server or "shopify" in powered:
        return "shopify"

    # 2. HTML signatures
    if (
        href_contains(lowered, "_next/static")
        or href_contains(lowered, "/_next/")
        or "__next_data__" in lowered
        or 'name="next-head-count"' in lowered
        or "next-route-announcer" in lowered
    ):
        return "nextjs"
    if "astro-island" in lowered or ("generator" in lowered and "astro" in lowered):
        return "astro"
    if "__remixcontext" in lowered or "__remixmanifest" in lowered:
        return "remix"
    if (
        "__nuxt" in lowered
        or "/_nuxt/" in lowered
        or ("generator" in lowered and "nuxt" in lowered)
    ):
        return "nuxt"
    if "__sveltekit" in lowered or "data-sveltekit-" in lowered:
        return "sveltekit"
    if "___gatsby" in lowered or 'id="gatsby-focus-wrapper"' in lowered:
        return "gatsby"
    if (
        "/wp-content/" in lowered
        or "/wp-includes/" in lowered
        or ("generator" in lowered and "wordpress" in lowered)
    ):
        return "wordpress"
    if "data-wf-page" in lowered or "data-wf-site" in lowered:
        return "webflow"
    if "cdn.shopify.com" in lowered or "shopify.theme" in lowered:
        return "shopify"
    if "static1.squarespace.com" in lowered or "squarespace-headers" in lowered:
        return "squarespace"
    if "static.wixstatic.com" in lowered or "wix-warmup-data" in lowered:
        return "wix"
    if "@vite/" in lowered:
        return "vite"
    if '<div id="root"' in lowered or "<div id='root'" in lowered:
        if 'type="module"' in lowered or "type='module'" in lowered:
            return "vite"
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
