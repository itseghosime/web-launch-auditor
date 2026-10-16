import httpx

from web_audit.models import FetchedPage, Redirect
from web_audit.urls import normalize_url, resolve_url, same_origin

REDIRECT_STATUSES = {301, 302, 303, 307, 308}


def fetch_page(
    url: str, client: httpx.Client, max_redirects: int = 5, max_bytes: int = 1_000_000
) -> FetchedPage:
    """Fetch one page with bounded same-origin redirects and decoded bytes."""
    if max_redirects < 0 or max_bytes < 1:
        raise ValueError("Redirect limit must be nonnegative and byte limit positive.")
    start_url = normalize_url(url)
    current = start_url
    visited = set()
    redirects = []

    while True:
        if current in visited:
            raise ValueError("Redirect loop detected.")
        visited.add(current)
        with client.stream("GET", current, follow_redirects=False) as response:
            if response.status_code in REDIRECT_STATUSES:
                if len(redirects) >= max_redirects:
                    raise ValueError("Redirect limit exceeded.")
                location = response.headers.get("location", "").strip()
                if not location:
                    raise ValueError("Redirect response has no Location header.")
                target = resolve_url(current, location)
                if not same_origin(start_url, target):
                    raise ValueError(
                        "Cross-origin redirect blocked. Supply the final URL."
                    )
                redirects.append(Redirect(current, response.status_code, target))
                current = target
                continue

            response.raise_for_status()
            media_type = response.headers.get("content-type", "").split(";", 1)[0]
            if media_type.strip().lower() not in {"text/html", "application/xhtml+xml"}:
                raise ValueError("The response is not HTML.")
            body = bytearray()
            for chunk in response.iter_bytes():
                body.extend(chunk)
                if len(body) > max_bytes:
                    raise ValueError("HTML exceeds the configured byte limit.")
            html = bytes(body).decode(response.encoding or "utf-8", errors="replace")
            return FetchedPage(
                current,
                response.status_code,
                html,
                redirects,
                headers=dict(response.headers) if hasattr(response, "headers") else {},
            )
