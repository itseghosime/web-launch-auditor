"""Public-only, DNS-pinned HTTP fetching for the hosted crawler."""

import http.client
import ipaddress
import queue
import socket
import ssl
import threading
import time
from urllib.parse import urlsplit

from web_audit.models import FetchedPage, Redirect
from web_audit.urls import (
    is_canonical_origin_redirect,
    normalize_url,
    resolve_url,
)

try:
    import certifi

    _CERTIFI_CAFILE = certifi.where()
    try:
        ssl._create_default_https_context = lambda: ssl.create_default_context(  # type: ignore[attr-defined]
            cafile=_CERTIFI_CAFILE
        )
    except Exception:
        pass
except ImportError:
    _CERTIFI_CAFILE = None

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

STEALTH_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "identity",
    "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Connection": "close",
}


_DNS_SLOTS = threading.BoundedSemaphore(4)
_BLOCKED_STATUSES = {403, 429, 503}


def public_url(value: str) -> str:
    if len(value) > 2048:
        raise ValueError("URL must be at most 2048 characters.")
    url = normalize_url(value)
    parts = urlsplit(url)
    if parts.port not in (None, 80, 443):
        raise ValueError("Only ports 80 and 443 are supported.")
    host = parts.hostname
    if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
        raise ValueError("Only public websites can be scanned.")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        check_address(address)
    return url


def check_address(address):
    if not address.is_global or address.is_multicast:
        raise ValueError("Only public website addresses are allowed.")
    if isinstance(address, ipaddress.IPv6Address):
        if address.ipv4_mapped or address.sixtofour or address.teredo:
            raise ValueError("IPv6 transition addresses are not supported.")


def resolve_public(host: str, port: int, timeout: float) -> list:
    """Bound DNS wait and outstanding resolver threads, including stuck resolvers."""
    if not _DNS_SLOTS.acquire(blocking=False):
        raise ValueError("DNS resolver is busy. Please retry later.")
    result = queue.Queue(maxsize=1)

    def resolve():
        try:
            result.put(socket.getaddrinfo(host, port, type=socket.SOCK_STREAM))
        except Exception as error:
            result.put(error)
        finally:
            _DNS_SLOTS.release()

    threading.Thread(target=resolve, daemon=True).start()
    try:
        addresses = result.get(timeout=max(0.01, timeout))
    except queue.Empty as error:
        raise TimeoutError("DNS lookup timed out.") from error
    if isinstance(addresses, Exception):
        raise ValueError("Could not resolve website address.") from addresses
    if not addresses:
        raise ValueError("Website has no IP addresses.")
    for _, _, _, _, address in addresses:
        check_address(ipaddress.ip_address(address[0]))
    return addresses


def _is_ssl_error(error: BaseException) -> bool:
    msg = str(error)
    return (
        isinstance(error, ssl.SSLError)
        or "CERTIFICATE_VERIFY_FAILED" in msg
        or "certificate verify failed" in msg
        or ("SSL" in msg and ("handshake" in msg.lower() or "cert" in msg.lower()))
    )


def _ssl_context(verify: bool = True) -> ssl.SSLContext:
    if not verify:
        return ssl._create_unverified_context()  # noqa: S323
    if _CERTIFI_CAFILE:
        try:
            return ssl.create_default_context(cafile=_CERTIFI_CAFILE)
        except Exception:
            pass
    return ssl.create_default_context()


def _looks_like_js_shell(body: bytes, content_type: str) -> bool:
    if len(body) < 500:
        text = body.decode("utf-8", errors="ignore")
        if '<div id="__next"' in text or '<div id="root"' in text:
            if text.count("<") < 20:
                return True
    return False


def _is_blocked(status: int, body: bytes) -> bool:
    if status in _BLOCKED_STATUSES:
        return True
    text = body[:2000].decode("utf-8", errors="ignore").lower()
    return "cloudflare" in text and (
        "challenge" in text or "attention required" in text or "checking if" in text
    )


class PublicFetcher:
    def __init__(self, deadline: float, max_bytes: int = 1_000_000):
        self.deadline = deadline
        self.max_bytes = max_bytes
        self.allowed = None
        self._ssl_fallback_used = False

    @property
    def ssl_fallback_used(self) -> bool:
        return self._ssl_fallback_used

    def remaining(self):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Scan time limit reached.")
        return min(5.0, remaining)

    def _do_request(self, url: str, verify_ssl: bool = True):
        """Single attempt via raw DNS-pinned socket."""
        parts = urlsplit(public_url(url))
        port = parts.port or (443 if parts.scheme == "https" else 80)
        addresses = resolve_public(parts.hostname, port, self.remaining())
        family, kind, proto, _, address = addresses[0]
        connection = http.client.HTTPConnection(parts.hostname, port)
        sock = socket.socket(family, kind, proto)
        watchdog = None
        try:
            sock.settimeout(self.remaining())
            sock.connect(address)
            if parts.scheme == "https":
                sock.settimeout(self.remaining())
                sock = _ssl_context(verify=verify_ssl).wrap_socket(
                    sock, server_hostname=parts.hostname
                )
            connection.sock = sock

            def abort():
                try:
                    sock.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
                try:
                    sock.close()
                except OSError:
                    pass

            watchdog = threading.Timer(
                max(0.01, self.deadline - time.monotonic()), abort
            )
            watchdog.daemon = True
            watchdog.start()
            path = parts.path or "/"
            if parts.query:
                path += "?" + parts.query
            sock.settimeout(self.remaining())
            connection.request("GET", path, headers=dict(STEALTH_HEADERS))
            sock.settimeout(self.remaining())
            response = connection.getresponse()
            headers = {key.lower(): value for key, value in response.getheaders()}
            if headers.get("content-encoding", "identity").lower() != "identity":
                raise ValueError(
                    "Compressed responses are unsupported for safe scanning."
                )
            body = bytearray()
            while True:
                try:
                    sock.settimeout(self.remaining())
                except OSError:
                    pass
                chunk = response.read(min(65536, self.max_bytes + 1 - len(body)))
                if not chunk:
                    break
                body.extend(chunk)
                if len(body) > self.max_bytes:
                    raise ValueError("Response exceeds the 1 MB limit.")
            return response.status, headers, bytes(body)
        finally:
            if watchdog is not None:
                watchdog.cancel()
            try:
                connection.close()
            except OSError:
                pass
            try:
                sock.close()
            except OSError:
                pass

    def request(self, url: str):
        """Tier 1 with automatic SSL fallback + optional Tier 2/3 escalation."""
        try:
            status, headers, body = self._do_request(url, verify_ssl=True)
        except BaseException as error:
            if _is_ssl_error(error):
                try:
                    status, headers, body = self._do_request(url, verify_ssl=False)
                    self._ssl_fallback_used = True
                except BaseException:
                    raise error from None
                else:
                    if _is_blocked(status, body):
                        return self._escalate(url, status, headers, body)
                    return status, headers, body
            raise

        if _is_blocked(status, body) or _looks_like_js_shell(
            body, headers.get("content-type", "")
        ):
            return self._escalate(url, status, headers, body)
        return status, headers, body

    def _escalate(self, url: str, status: int, headers: dict, body: bytes):
        """Tier 2 (httpx http2) -> Tier 3 (Playwright) fallbacks."""
        tier2 = self._try_httpx(url)
        if tier2 is not None:
            t_status, t_headers, t_body = tier2
            if not _is_blocked(t_status, t_body) and not _looks_like_js_shell(
                t_body, t_headers.get("content-type", "")
            ):
                return t_status, t_headers, t_body
            tier3 = self._try_playwright(url)
            if tier3 is not None:
                return tier3
            return t_status, t_headers, t_body

        tier3 = self._try_playwright(url)
        if tier3 is not None:
            return tier3
        return status, headers, body

    def _try_httpx(self, url: str):
        try:
            import httpx
        except ImportError:
            return None
        try:
            remaining = max(1.0, self.deadline - time.monotonic())
            public_url(url)
            with httpx.Client(
                http2=True,
                verify=_CERTIFI_CAFILE or True,
                follow_redirects=False,
                timeout=remaining,
                headers=dict(STEALTH_HEADERS),
            ) as client:
                resp = client.get(url)
                headers = {k.lower(): v for k, v in resp.headers.items()}
                body = resp.content
                if len(body) > self.max_bytes:
                    body = body[: self.max_bytes]
                return resp.status_code, headers, body
        except Exception:
            return None

    def _try_playwright(self, url: str):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            return None
        remaining = self.deadline - time.monotonic()
        if remaining < 3:
            return None
        try:
            public_url(url)
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                try:
                    context = browser.new_context(
                        ignore_https_errors=True,
                        user_agent=USER_AGENT,
                    )
                    page = context.new_page()
                    page.goto(
                        url,
                        wait_until="domcontentloaded",
                        timeout=min(15000, int(remaining * 1000)),
                    )
                    html = page.content()
                    body = html.encode("utf-8")
                    if len(body) > self.max_bytes:
                        body = body[: self.max_bytes]
                    headers = {"content-type": "text/html; charset=utf-8"}
                    return 200, headers, body
                finally:
                    browser.close()
        except Exception:
            return None

    def resource(self, url: str):
        start = public_url(url)
        current = start
        seen = set()
        redirects = []
        for _ in range(6):
            if current in seen:
                raise ValueError("Redirect loop detected.")
            seen.add(current)
            if self.allowed is not None and not self.allowed(current):
                raise ValueError("This page is disallowed by robots.txt.")
            status, headers, body = self.request(current)
            if status not in {301, 302, 303, 307, 308}:
                return current, status, headers, body, redirects
            location = headers.get("location", "").strip()
            if not location:
                raise ValueError("Redirect has no destination.")
            target = public_url(resolve_url(current, location))
            if not is_canonical_origin_redirect(start, target):
                raise ValueError("Cross-origin redirect blocked. Use the final URL.")
            redirects.append(Redirect(current, status, target))
            current = target
        raise ValueError("Redirect limit exceeded.")

    def __call__(self, url: str) -> FetchedPage:
        current, status, headers, body, redirects = self.resource(url)
        if status >= 400:
            raise ValueError(f"Website returned HTTP {status}.")
        content_type = headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if content_type not in {"text/html", "application/xhtml+xml"}:
            raise ValueError("The response is not an HTML page.")
        from bs4 import UnicodeDammit

        html = UnicodeDammit(body, is_html=True).unicode_markup or ""
        page = FetchedPage(current, status, html, redirects)
        if self._ssl_fallback_used:
            page._ssl_fallback = True  # type: ignore[attr-defined]
        return page
