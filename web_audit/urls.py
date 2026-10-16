from urllib.parse import urljoin, urlsplit, urlunsplit


def normalize_url(value: str) -> str:
    """Normalize supported URL syntax. This is not destination authorization."""
    if len(value) > 2048:
        raise ValueError("URLs must be at most 2048 characters.")
    value = value.strip()
    if not value or any(char.isspace() or ord(char) < 32 for char in value):
        raise ValueError("Use a non-empty URL without spaces or control characters.")
    if "\\" in value:
        raise ValueError("Use forward slashes in URLs.")
    parts = urlsplit(value)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise ValueError("Use a complete http:// or https:// URL.")
    if parts.username is not None or parts.password is not None:
        raise ValueError("URLs must not contain credentials.")
    port = parts.port  # Access also raises ValueError for malformed ports.
    host = parts.hostname.lower()
    if ":" in host:
        host = f"[{host}]"  # Preserve IPv6 brackets.
    default_port = 443 if parts.scheme == "https" else 80
    authority = host if port is None or port == default_port else f"{host}:{port}"
    return urlunsplit((parts.scheme, authority, parts.path or "/", parts.query, ""))


def same_origin(first: str, second: str) -> bool:
    left = urlsplit(normalize_url(first))
    right = urlsplit(normalize_url(second))
    return (left.scheme, left.netloc) == (right.scheme, right.netloc)


def is_canonical_origin_redirect(first: str, second: str) -> bool:
    """Return True if second is same-origin or a canonical hostname redirect (e.g. www vs non-www, http -> https)."""
    if same_origin(first, second):
        return True
    try:
        left = urlsplit(normalize_url(first))
        right = urlsplit(normalize_url(second))
    except ValueError:
        return False
    if left.scheme not in {"http", "https"} or right.scheme not in {"http", "https"}:
        return False
    left_default_port = 443 if left.scheme == "https" else 80
    right_default_port = 443 if right.scheme == "https" else 80
    left_is_default = left.port is None or left.port == left_default_port
    right_is_default = right.port is None or right.port == right_default_port
    if not (left_is_default and right_is_default):
        if left.port != right.port:
            return False
    left_host = (left.hostname or "").lower()
    right_host = (right.hostname or "").lower()
    if left_host == right_host:
        return True
    if left_host == f"www.{right_host}" or right_host == f"www.{left_host}":
        return True
    return False


def resolve_url(base_url: str, href: str) -> str:
    return normalize_url(urljoin(base_url, href.strip()))
