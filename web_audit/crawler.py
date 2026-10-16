"""Bounded, polite breadth-first crawl using the existing HTML checks."""

import http.client
import ssl
import time
from collections import deque
from dataclasses import asdict
from urllib.parse import urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

try:
    import certifi

    _CERTIFI_CAFILE = certifi.where()
    try:
        ssl._create_default_https_context = lambda: ssl.create_default_context(
            cafile=_CERTIFI_CAFILE
        )
    except Exception:
        pass
except ImportError:
    _CERTIFI_CAFILE = None

from web_audit.checks import inspect_html
from web_audit.safe_fetch import USER_AGENT, PublicFetcher, public_url
from web_audit.urls import is_canonical_origin_redirect


def _is_ssl_error(error: BaseException) -> bool:
    msg = str(error)
    return (
        isinstance(error, ssl.SSLError)
        or "CERTIFICATE_VERIFY_FAILED" in msg
        or "certificate verify failed" in msg
        or ("SSL" in msg and ("handshake" in msg.lower() or "cert" in msg.lower()))
    )


def crawl(
    url,
    max_pages=5,
    max_depth=1,
    on_page=None,
    *,
    fetcher=None,
    max_seconds=90,
    delay=0.25,
):
    if not 1 <= max_pages <= 20 or not 0 <= max_depth <= 3:
        raise ValueError("Use 1–20 pages and a depth of 0–3.")
    start = public_url(url)
    deadline = time.monotonic() + max_seconds
    fetch = fetcher or PublicFetcher(deadline)
    robots = None
    robots_findings = []
    robots_url = ""
    if fetcher is None:
        parts = urlsplit(start)
        robots_url = urlunsplit((parts.scheme, parts.netloc, "/robots.txt", "", ""))
        body = b""
        status = 200
        try:
            _, status, _, body, _ = fetch.resource(robots_url)
        except Exception as error:
            if _is_ssl_error(error):
                orig_ctx = getattr(ssl, "_create_default_https_context", None)
                try:
                    ssl._create_default_https_context = ssl._create_unverified_context
                    _, status, _, body, _ = fetch.resource(robots_url)
                    robots_findings.append(
                        {
                            "rule": "ssl_unverified_fallback",
                            "category": "Security",
                            "severity": "review",
                            "message": "SSL certificate verification failed on robots.txt; fetched via unverified fallback.",
                            "evidence": robots_url,
                            "recommendation": "Ensure a valid, trusted SSL/TLS certificate chain is installed.",
                        }
                    )
                except Exception:
                    status = 599
                finally:
                    if orig_ctx is not None:
                        ssl._create_default_https_context = orig_ctx
            else:
                status = 599

        if status == 599:
            robots_findings.append(
                {
                    "rule": "robots_unavailable",
                    "category": "SEO",
                    "severity": "review",
                    "message": "robots.txt could not be fetched",
                    "evidence": robots_url,
                    "recommendation": "Ensure robots.txt is reachable or add one to control crawler access.",
                }
            )
        elif status not in {401, 403, 404, 410} and status >= 400:
            robots_findings.append(
                {
                    "rule": "robots_unavailable",
                    "category": "SEO",
                    "severity": "review",
                    "message": "robots.txt returned an error",
                    "evidence": f"HTTP {status} at {robots_url}",
                    "recommendation": "Ensure robots.txt is reachable.",
                }
            )
        elif status not in {404, 410}:
            if status in {401, 403}:
                robots_findings.append(
                    {
                        "rule": "robots_disallow",
                        "category": "SEO",
                        "severity": "review",
                        "message": "robots.txt disallows crawling",
                        "evidence": f"HTTP {status} at {robots_url}",
                        "recommendation": "This scan proceeded for audit purposes; respect robots.txt in production crawlers.",
                    }
                )
            robots = RobotFileParser()
            robots.parse(body.decode("utf-8", errors="replace").splitlines())
            delay = max(delay, robots.crawl_delay(USER_AGENT) or 0)
            # Note: Do not set fetch.allowed to block; keep non-blocking for audit
            if not robots.can_fetch(USER_AGENT, start):
                robots_findings.append(
                    {
                        "rule": "robots_disallow",
                        "category": "SEO",
                        "severity": "review",
                        "message": "robots.txt disallows crawling",
                        "evidence": robots_url,
                        "recommendation": "This scan proceeded for audit purposes; respect robots.txt in production crawlers.",
                    }
                )

    # Effective origin may shift after redirects (e.g. example.com -> www.example.com)
    effective_origin = start
    pending = deque([(start, 0)])
    scheduled = {start}
    visited = set()
    pages = []
    stop_reason = "finished"
    while pending and len(pages) < max_pages:
        if time.monotonic() >= deadline:
            stop_reason = "deadline"
            break
        current, depth = pending.popleft()
        if current in visited:
            continue
        visited.add(current)
        try:
            try:
                page = fetch(current)
            except Exception as error:
                if _is_ssl_error(error):
                    orig_ctx = getattr(ssl, "_create_default_https_context", None)
                    try:
                        ssl._create_default_https_context = (
                            ssl._create_unverified_context
                        )
                        page = fetch(current)
                        setattr(page, "_ssl_fallback", True)
                    except Exception:
                        raise error from None
                    finally:
                        if orig_ctx is not None:
                            ssl._create_default_https_context = orig_ctx
                else:
                    raise

            # Update effective origin after canonical redirect (e.g. naked -> www, http -> https)
            if page.redirects and is_canonical_origin_redirect(
                effective_origin, page.url
            ):
                effective_origin = page.url
            if not is_canonical_origin_redirect(effective_origin, page.url):
                raise ValueError("Page left the original website.")
            visited.add(page.url)
            report = inspect_html(page.html, page.url, source="url", max_links=500)
            report.status_code = page.status_code
            report.redirects = page.redirects
            result = asdict(report)
            result["error"] = None
            result["depth"] = depth

            # SSL fallback non-fatal review finding
            if getattr(page, "_ssl_fallback", False):
                result["findings"].append(
                    {
                        "rule": "ssl_unverified_fallback",
                        "category": "Security",
                        "severity": "review",
                        "message": "SSL certificate could not be verified; crawled using unverified fallback context.",
                        "evidence": page.url,
                        "recommendation": "Ensure a valid, trusted SSL/TLS certificate chain is installed.",
                    }
                )

            # Robots disallow finding on page if disallowed
            if robots and not robots.can_fetch(USER_AGENT, page.url):
                if not any(f["rule"] == "robots_disallow" for f in result["findings"]):
                    result["findings"].append(
                        {
                            "rule": "robots_disallow",
                            "category": "SEO",
                            "severity": "review",
                            "message": "robots.txt disallows crawling",
                            "evidence": robots_url or f"{page.url}/robots.txt",
                            "recommendation": "This scan proceeded for audit purposes; respect robots.txt in production crawlers.",
                        }
                    )

            # Robots informational findings (attached to first page)
            if robots_findings and not pages:
                existing_rules = {f["rule"] for f in result["findings"]}
                for rf in robots_findings:
                    if rf["rule"] not in existing_rules:
                        result["findings"].append(rf)
                        existing_rules.add(rf["rule"])

            result["internal_links"] = report.internal_links[:500]
            result["findings"] = result["findings"][:500]
            result["findings_truncated"] = len(report.findings) > 500
            for link in report.internal_links[:500]:
                if depth < max_depth and link not in scheduled and len(scheduled) < 501:
                    scheduled.add(link)
                    pending.append((link, depth + 1))
                elif depth >= max_depth and link not in visited:
                    stop_reason = "depth_limit"
        except (ValueError, OSError, http.client.HTTPException) as error:
            message = str(error)
            if (
                "CERTIFICATE_VERIFY_FAILED" in message
                or "certificate verify failed" in message
            ):
                message = "SSL certificate could not be verified — the site may use a self-signed or expired certificate."
            result = {
                "page_url": current,
                "source": "url",
                "status_code": None,
                "findings": [],
                "internal_links": [],
                "redirects": [],
                "error": message,
                "depth": depth,
            }
            # Still attach robots findings to first failed page
            if robots_findings and not pages:
                existing_rules = {f["rule"] for f in result["findings"]}
                for rf in robots_findings:
                    if rf["rule"] not in existing_rules:
                        result["findings"].append(rf)
                        existing_rules.add(rf["rule"])
        pages.append(result)
        if on_page:
            on_page(result)
        if pending and len(pages) < max_pages:
            time.sleep(min(delay, max(0, deadline - time.monotonic())))
    if pending and len(pages) >= max_pages:
        stop_reason = "page_limit"
    return {"pages": pages, "stop_reason": stop_reason}
