import httpx
import pytest

from web_audit.fetcher import fetch_page


def client_for(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_redirect_chain_has_evidence(good_html):
    requests = []

    def handler(request):
        requests.append(str(request.url))
        if request.url.path == "/":
            return httpx.Response(302, headers={"location": "/home"})
        return httpx.Response(
            200, text=good_html, headers={"content-type": "text/html"}
        )

    with client_for(handler) as client:
        page = fetch_page("https://example.com/", client)
    assert page.url == "https://example.com/home"
    assert page.html == good_html
    assert page.redirects[0].status == 302
    assert requests == ["https://example.com/", "https://example.com/home"]


@pytest.mark.parametrize("status", [301, 302, 303, 307, 308])
def test_supported_redirect_statuses(status):
    def handler(request):
        if request.url.path == "/":
            return httpx.Response(status, headers={"location": "/home"})
        return httpx.Response(
            200, text="<html></html>", headers={"content-type": "text/html"}
        )

    with client_for(handler) as client:
        assert fetch_page("https://example.com/", client).url.endswith("/home")


def test_cross_origin_blocked_before_target_is_requested():
    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(302, headers={"location": "https://other.example/"})

    with client_for(handler) as client, pytest.raises(ValueError, match="Cross-origin"):
        fetch_page("https://example.com/", client)
    assert seen == ["https://example.com/"]


def test_redirect_loop_stops():
    with client_for(
        lambda request: httpx.Response(302, headers={"location": "/"})
    ) as client:
        with pytest.raises(ValueError, match="loop"):
            fetch_page("https://example.com/", client)


def test_redirect_limit_stops_new_targets():
    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(302, headers={"location": request.url.path + "x"})

    with client_for(handler) as client, pytest.raises(ValueError, match="limit"):
        fetch_page("https://example.com/", client, max_redirects=1)
    assert len(seen) == 2


def test_missing_redirect_location():
    with client_for(lambda request: httpx.Response(302)) as client:
        with pytest.raises(ValueError, match="Location"):
            fetch_page("https://example.com/", client)


@pytest.mark.parametrize("status", [404, 500])
def test_error_status_is_not_parsed(status):
    with client_for(lambda request: httpx.Response(status)) as client:
        with pytest.raises(httpx.HTTPStatusError):
            fetch_page("https://example.com/", client)


def test_non_html_rejected():
    with client_for(
        lambda request: httpx.Response(
            200, headers={"content-type": "application/json"}
        )
    ) as client:
        with pytest.raises(ValueError, match="not HTML"):
            fetch_page("https://example.com/", client)


def test_large_body_rejected():
    with client_for(
        lambda request: httpx.Response(
            200, content=b"x" * 11, headers={"content-type": "text/html"}
        )
    ) as client:
        with pytest.raises(ValueError, match="byte limit"):
            fetch_page("https://example.com/", client, max_bytes=10)


def test_timeout_is_propagated():
    def handler(request):
        raise httpx.ReadTimeout("timeout", request=request)

    with client_for(handler) as client, pytest.raises(httpx.ReadTimeout):
        fetch_page("https://example.com/", client)
