import pytest

from web_audit.urls import normalize_url, resolve_url, same_origin


@pytest.mark.parametrize(
    "value,expected",
    [
        (" https://EXAMPLE.com#team ", "https://example.com/"),
        ("https://example.com:443/a?x=1#part", "https://example.com/a?x=1"),
        ("http://example.com:80", "http://example.com/"),
        ("https://example.com:8443/", "https://example.com:8443/"),
        ("http://[::1]:8080/", "http://[::1]:8080/"),
    ],
)
def test_normalization(value, expected):
    assert normalize_url(value) == expected


@pytest.mark.parametrize(
    "value",
    [
        "",
        "example.com",
        "ftp://example.com",
        "https://",
        "https://[bad",
        "https://example.com:bad",
        "https://example.com:99999",
        "https://user:password@example.com",
        "https://exa mple.com",
        "https://example.com/line\nbreak",
        "https://example.com\\other",
    ],
)
def test_invalid_urls(value):
    with pytest.raises(ValueError):
        normalize_url(value)


def test_relative_resolution():
    assert (
        resolve_url("https://example.com/docs/start", "../about#team")
        == "https://example.com/about"
    )


@pytest.mark.parametrize(
    "other,expected",
    [
        ("https://example.com:443/about", True),
        ("https://www.example.com/", False),
        ("http://example.com/", False),
        ("https://example.com:8443/", False),
    ],
)
def test_origin(other, expected):
    assert same_origin("https://example.com", other) is expected
