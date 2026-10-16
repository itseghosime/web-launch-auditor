from web_audit.stack import detect_stack, get_stack_recommendation


def test_detect_nextjs():
    html = '<script src="/_next/static/foo.js"></script>'
    assert detect_stack(html) == "nextjs"


def test_detect_astro():
    html = "<astro-island client:load></astro-island>"
    assert detect_stack(html) == "astro"


def test_detect_wordpress():
    html = '<link href="/wp-content/themes/x/style.css">'
    assert detect_stack(html) == "wordpress"


def test_detect_webflow():
    html = '<body data-wf-page="abc">'
    assert detect_stack(html) == "webflow"


def test_detect_vite():
    html = '<div id="root"></div><script type="module" src="/@vite/client"></script>'
    assert detect_stack(html) == "vite"


def test_detect_remix():
    html = "<script>window.__remixContext={}</script>"
    assert detect_stack(html) == "remix"


def test_fallback_html():
    assert detect_stack("<html><body>hi</body></html>") == "html"


def test_detect_nextjs_header():
    assert detect_stack("", {"X-Powered-By": "Next.js"}) == "nextjs"


def test_detect_nextjs_app_router():
    html = '<script src="/_next/static/chunks/app/layout.js"></script>'
    assert detect_stack(html) == "nextjs"


def test_detect_nuxt():
    html = '<div id="__nuxt"></div>'
    assert detect_stack(html) == "nuxt"


def test_detect_sveltekit():
    html = '<body data-sveltekit-preload-data="hover">'
    assert detect_stack(html) == "sveltekit"


def test_detect_shopify():
    html = '<script src="https://cdn.shopify.com/s/files/1/00/theme.js"></script>'
    assert detect_stack(html) == "shopify"


def test_recommendation():
    assert "app/layout.tsx" in get_stack_recommendation(
        "og:image.missing", "nextjs", "add image"
    )
