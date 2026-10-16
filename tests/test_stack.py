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


def test_recommendation():
    assert "app/layout.tsx" in get_stack_recommendation(
        "og:image.missing", "nextjs", "add image"
    )
