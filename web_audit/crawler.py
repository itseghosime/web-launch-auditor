"""Bounded, polite breadth-first crawl using the existing HTML checks."""

import http.client
import time
from collections import deque
from dataclasses import asdict
from urllib.parse import urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

from web_audit.checks import inspect_html
from web_audit.safe_fetch import USER_AGENT, PublicFetcher, public_url
from web_audit.urls import same_origin


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
    if fetcher is None:
        parts = urlsplit(start)
        robots_url = urlunsplit((parts.scheme, parts.netloc, "/robots.txt", "", ""))
        _, status, _, body, _ = fetch.resource(robots_url)
        if status in {401, 403}:
            raise ValueError("This website does not permit crawling (robots.txt).")
        if status not in {404, 410}:
            if status >= 400:
                raise ValueError("Could not verify website robots.txt policy.")
            robots = RobotFileParser()
            robots.parse(body.decode("utf-8", errors="replace").splitlines())
            delay = max(delay, robots.crawl_delay(USER_AGENT) or 0)
            fetch.allowed = lambda target: robots.can_fetch(USER_AGENT, target)
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
            if robots and not robots.can_fetch(USER_AGENT, current):
                raise ValueError("This page is disallowed by robots.txt.")
            page = fetch(current)
            if not same_origin(start, page.url):
                raise ValueError("Page left the original website.")
            visited.add(page.url)
            report = inspect_html(page.html, page.url, source="url", max_links=500)
            report.status_code = page.status_code
            report.redirects = page.redirects
            result = asdict(report)
            result["error"] = None
            result["depth"] = depth
            # Keep persisted output and the frontier bounded on link-heavy sites.
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
            result = {
                "page_url": current,
                "source": "url",
                "status_code": None,
                "findings": [],
                "internal_links": [],
                "redirects": [],
                "error": str(error),
                "depth": depth,
            }
        pages.append(result)
        if on_page:
            on_page(result)
        if pending and len(pages) < max_pages:
            time.sleep(min(delay, max(0, deadline - time.monotonic())))
    if pending and len(pages) >= max_pages:
        stop_reason = "page_limit"
    return {"pages": pages, "stop_reason": stop_reason}
