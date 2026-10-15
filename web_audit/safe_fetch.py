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
from web_audit.urls import normalize_url, resolve_url, same_origin

USER_AGENT = "WebLaunchAuditor/1.0"
_DNS_SLOTS = threading.BoundedSemaphore(4)


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


class PublicFetcher:
    def __init__(self, deadline: float, max_bytes: int = 1_000_000):
        self.deadline = deadline
        self.max_bytes = max_bytes
        self.allowed = None

    def remaining(self):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("Scan time limit reached.")
        return min(5.0, remaining)

    def request(self, url: str):
        """Connect to a vetted numeric sockaddr; DNS is never consulted again."""
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
                sock = ssl.create_default_context().wrap_socket(
                    sock, server_hostname=parts.hostname
                )
            connection.sock = sock

            def abort():
                # Shutdown interrupts makefile reads, including drip-fed headers.
                try:
                    sock.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
                sock.close()

            watchdog = threading.Timer(
                max(0.01, self.deadline - time.monotonic()), abort
            )
            watchdog.daemon = True
            watchdog.start()
            path = parts.path or "/"
            if parts.query:
                path += "?" + parts.query
            sock.settimeout(self.remaining())
            connection.request(
                "GET",
                path,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept-Encoding": "identity",
                    "Accept": "text/html, text/plain;q=0.9",
                    "Connection": "close",
                },
            )
            sock.settimeout(self.remaining())
            response = connection.getresponse()
            headers = {key.lower(): value for key, value in response.getheaders()}
            if headers.get("content-encoding", "identity").lower() != "identity":
                raise ValueError(
                    "Compressed responses are unsupported for safe scanning."
                )
            body = bytearray()
            while True:
                sock.settimeout(self.remaining())
                chunk = response.read1(min(65536, self.max_bytes + 1 - len(body)))
                if not chunk:
                    break
                body.extend(chunk)
                if len(body) > self.max_bytes:
                    raise ValueError("Response exceeds the 1 MB limit.")
            return response.status, headers, bytes(body)
        finally:
            if watchdog is not None:
                watchdog.cancel()
            connection.close()
            sock.close()

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
            if not same_origin(start, target):
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
        # BeautifulSoup handles HTML charset declarations when given raw bytes.
        from bs4 import UnicodeDammit

        html = UnicodeDammit(body, is_html=True).unicode_markup or ""
        return FetchedPage(current, status, html, redirects)
