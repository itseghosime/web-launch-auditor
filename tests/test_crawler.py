import socket
import time

import pytest

from web_audit.crawler import crawl
from web_audit.models import FetchedPage
from web_audit.safe_fetch import PublicFetcher, public_url, resolve_public


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost/",
        "http://127.0.0.1/",
        "http://10.0.0.1/",
        "http://169.254.169.254/",
        "http://[::1]/",
        "http://[::ffff:8.8.8.8]/",
        "http://example.com:8080/",
        "file:///etc/passwd",
        "https://u:p@example.com",
        "http://[2002:0808:0808::1]/",
        "http://224.0.0.1/",
    ],
)
def test_private_and_unsupported_targets_rejected(url):
    with pytest.raises(ValueError):
        public_url(url)


def test_mixed_dns_answers_rejected(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *a, **kw: [
            (2, 1, 6, "", ("93.184.216.34", 443)),
            (2, 1, 6, "", ("127.0.0.1", 443)),
        ],
    )
    with pytest.raises(ValueError, match="public"):
        resolve_public("example.com", 443, 1)


def test_dns_timeout_is_bounded(monkeypatch):
    def slow(*args, **kwargs):
        time.sleep(0.1)
        return []

    monkeypatch.setattr(socket, "getaddrinfo", slow)
    with pytest.raises(TimeoutError):
        resolve_public("example.com", 443, 0.01)


def test_connect_pins_validated_numeric_address(monkeypatch):
    import web_audit.safe_fetch as module

    calls = []
    monkeypatch.setattr(
        module, "resolve_public", lambda *args: [(2, 1, 6, "", ("93.184.216.34", 80))]
    )

    class FakeSocket:
        def settimeout(self, timeout):
            pass

        def connect(self, address):
            calls.append(address)
            raise OSError("stop before HTTP")

        def close(self):
            pass

    monkeypatch.setattr(socket, "socket", lambda *args: FakeSocket())
    with pytest.raises(OSError):
        PublicFetcher(time.monotonic() + 10).request("http://example.com/")
    assert calls == [("93.184.216.34", 80)]


def test_redirect_to_private_target_blocked(monkeypatch):
    fetch = PublicFetcher(time.monotonic() + 10)
    monkeypatch.setattr(
        fetch, "request", lambda url: (302, {"location": "http://127.0.0.1/"}, b"")
    )
    with pytest.raises(ValueError, match="public"):
        fetch("https://example.com/")


def test_cross_origin_redirect_blocked(monkeypatch):
    fetch = PublicFetcher(time.monotonic() + 10)
    monkeypatch.setattr(
        fetch, "request", lambda url: (302, {"location": "https://other.com/"}, b"")
    )
    with pytest.raises(ValueError, match="Cross-origin"):
        fetch("https://example.com/")


def test_crawl_bfs_deduplicates_and_bounds_pages():
    seen = []

    def fetch(url):
        seen.append(url)
        return FetchedPage(
            url,
            200,
            '<a href="/a">a</a><a href="/b">b</a>'
            '<a href="/a#test">a</a><a href="https://other.com">x</a>',
        )

    updates = []
    result = crawl("https://example.com", 2, 2, updates.append, fetcher=fetch, delay=0)
    assert seen == ["https://example.com/", "https://example.com/a"]
    assert len(updates) == 2
    assert result["stop_reason"] == "page_limit"


def test_depth_zero_and_page_failure():
    def fetch(url):
        return FetchedPage(url, 200, '<a href="/next">Next</a>')

    result = crawl("https://example.com", 5, 0, fetcher=fetch, delay=0)
    assert len(result["pages"]) == 1
    assert result["stop_reason"] == "depth_limit"

    def broken(url):
        raise ValueError("Website returned HTTP 404.")

    result = crawl("https://example.com", fetcher=broken, delay=0)
    assert result["pages"][0]["error"] == "Website returned HTTP 404."
    assert result["pages"][0]["findings"] == []


def test_deadline_stops_work():
    result = crawl("https://example.com", fetcher=lambda url: None, max_seconds=0)
    assert result == {"pages": [], "stop_reason": "deadline"}


def test_robots_disallow_is_non_blocking(monkeypatch):
    import web_audit.crawler as module

    class FakeFetcher:
        def __init__(self, deadline):
            self.allowed = None

        def resource(self, url):
            return url, 200, {}, b"User-agent: *\nDisallow: /", []

        def __call__(self, url):
            from web_audit.models import FetchedPage

            return FetchedPage(url, 200, "<html><head><title>T</title></head></html>")

    monkeypatch.setattr(module, "PublicFetcher", FakeFetcher)
    result = crawl("https://example.com")
    assert result["pages"][0]["error"] is None
    assert any(f["rule"] == "robots_disallow" for f in result["pages"][0]["findings"])


def test_robots_policy_applies_before_redirect_request(monkeypatch):
    fetch = PublicFetcher(time.monotonic() + 10)
    fetch.allowed = lambda url: not url.endswith("/private")
    requested = []

    def request(url):
        requested.append(url)
        return 302, {"location": "/private"}, b""

    monkeypatch.setattr(fetch, "request", request)
    with pytest.raises(ValueError, match="robots"):
        fetch("https://example.com/")
    assert requested == ["https://example.com/"]


def test_huge_base_and_link_count_are_bounded():
    from web_audit.checks import inspect_html

    html = '<base href="https://example.com/' + "x" * 5000 + '">'
    html += "".join(f'<a href="?n={i}">link</a>' for i in range(1000))
    report = inspect_html(html, "https://example.com", max_links=10)
    assert len(report.internal_links) == 10
    assert max(map(len, report.internal_links)) < 100
    assert any(f.rule == "base.invalid" for f in report.findings)


def test_watchdog_interrupts_slow_headers(monkeypatch):
    import threading

    import web_audit.safe_fetch as module

    closed = threading.Event()

    class FakeSocket:
        def settimeout(self, timeout):
            pass

        def connect(self, address):
            pass

        def shutdown(self, how):
            closed.set()

        def close(self):
            pass

    class FakeConnection:
        def __init__(self, *args):
            pass

        def request(self, *args, **kwargs):
            pass

        def getresponse(self):
            assert closed.wait(0.5), "absolute deadline did not close socket"
            raise OSError("closed by watchdog")

        def close(self):
            pass

    monkeypatch.setattr(
        module, "resolve_public", lambda *args: [(2, 1, 6, "", ("93.184.216.34", 80))]
    )
    monkeypatch.setattr(socket, "socket", lambda *args: FakeSocket())
    monkeypatch.setattr(module.http.client, "HTTPConnection", FakeConnection)
    with pytest.raises(OSError, match="watchdog"):
        PublicFetcher(time.monotonic() + 0.02).request("http://example.com/")


def test_ssl_cert_verification_fallback_records_finding():
    import ssl

    from web_audit.models import FetchedPage

    attempts = []

    def fetch(url):
        attempts.append(url)
        if len(attempts) == 1:
            raise ssl.SSLCertVerificationError(
                "[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: unable to get local issuer certificate (_ssl.c:1082)"
            )
        return FetchedPage(
            url, 200, "<html><head><title>T</title></head><body>OK</body></html>"
        )

    res = crawl("https://example.com", fetcher=fetch, delay=0)
    assert len(res["pages"]) == 1
    page = res["pages"][0]
    assert page["error"] is None
    assert any(f["rule"] == "ssl_unverified_fallback" for f in page["findings"])


def test_canonical_origin_redirect_crawls_landing_host():
    from web_audit.models import FetchedPage, Redirect

    crawled = []

    def fetch(url):
        crawled.append(url)
        if url == "https://example.com/":
            return FetchedPage(
                "https://www.example.com/",
                200,
                '<html><head><title>Home</title></head><body><a href="/about">About</a></body></html>',
                redirects=[
                    Redirect("https://example.com/", 301, "https://www.example.com/")
                ],
            )
        elif url == "https://www.example.com/about":
            return FetchedPage(
                "https://www.example.com/about",
                200,
                "<html><head><title>About</title></head><body>About Us</body></html>",
            )
        raise ValueError(f"Unexpected url {url}")

    res = crawl("https://example.com", max_pages=3, max_depth=1, fetcher=fetch, delay=0)
    assert len(res["pages"]) == 2
    assert res["pages"][0]["page_url"] == "https://www.example.com/"
    assert res["pages"][1]["page_url"] == "https://www.example.com/about"
    assert res["pages"][0]["error"] is None
    assert res["pages"][1]["error"] is None
