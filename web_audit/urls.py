from urllib.parse import urljoin, urlsplit, urlunsplit


def normalize_url(value: str) -> str:
    """Normalize supported URL syntax. This is not destination authorization."""
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


def resolve_url(base_url: str, href: str) -> str:
    return normalize_url(urljoin(base_url, href.strip()))
