import subprocess
import sys
from pathlib import Path

import auditor
import httpx
import pytest

ROOT = Path(__file__).parent
GOOD = (ROOT / "fixtures/good.html").read_text(encoding="utf-8")
BROKEN = (ROOT / "fixtures/broken.html").read_text(encoding="utf-8")


def rules(html):
    return [finding["rule"] for finding in auditor.audit_html(html)]


def test_good_fixture_has_no_findings():
    assert auditor.audit_html(GOOD) == []


def test_broken_fixture_has_five_expected_findings():
    assert rules(BROKEN) == [
        "title.missing",
        "description.missing",
        "h1.missing",
        "language.missing",
        "image.alt.missing",
    ]


@pytest.mark.parametrize("title", ["", "   "])
def test_blank_title_is_reported(title):
    html = GOOD.replace("<title>Example Studio</title>", f"<title>{title}</title>")
    assert rules(html) == ["title.missing"]


def test_missing_title_is_reported():
    assert rules(GOOD.replace("<title>Example Studio</title>", "")) == ["title.missing"]


def test_whitespace_description_is_reported():
    html = GOOD.replace("Example Studio creates websites for small teams.", "   ")
    assert rules(html) == ["description.missing"]


def test_description_without_content_is_reported():
    html = GOOD.replace(
        'content="Example Studio creates websites for small teams."', ""
    )
    assert rules(html) == ["description.missing"]


def test_empty_h1_is_reported():
    assert rules(GOOD.replace("Websites for small teams", " ")) == ["h1.empty"]


def test_multiple_h1_elements_request_review():
    assert rules(GOOD.replace("</body>", "<h1>Another</h1></body>")) == ["h1.multiple"]


def test_whitespace_language_is_reported():
    assert rules(GOOD.replace('lang="en"', 'lang=" "')) == ["language.missing"]


def test_decorative_empty_alt_is_not_reported_as_missing():
    assert "image.alt.missing" not in rules(GOOD)


def test_each_missing_alt_gets_its_own_finding():
    html = GOOD.replace("</body>", '<img src="a.png"><img src="b.png"></body>')
    assert rules(html) == ["image.alt.missing", "image.alt.missing"]


def test_url_fragment_is_removed():
    assert auditor.validate_url(" https://example.com#about ") == "https://example.com/"


@pytest.mark.parametrize(
    "value",
    [
        "",
        "example.com",
        "ftp://example.com",
        "https://",
        "https://exam ple.com",
        "https://user:secret@example.com",
        "https://example.com:abc",
        "https://[broken",
    ],
)
def test_invalid_urls_are_rejected(value):
    with pytest.raises(ValueError):
        auditor.validate_url(value)


def test_fetch_reads_html(monkeypatch):
    def fake_get(url, **kwargs):
        return httpx.Response(
            200,
            text=GOOD,
            headers={"content-type": "text/html; charset=utf-8"},
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(auditor.httpx, "get", fake_get)
    assert auditor.fetch_html("https://example.com") == GOOD


@pytest.mark.parametrize("status", [301, 404, 500])
def test_fetch_rejects_unsuccessful_status(monkeypatch, status):
    def fake_get(url, **kwargs):
        return httpx.Response(status, request=httpx.Request("GET", url))

    monkeypatch.setattr(auditor.httpx, "get", fake_get)
    with pytest.raises(httpx.HTTPStatusError):
        auditor.fetch_html("https://example.com")


def test_fetch_rejects_non_html(monkeypatch):
    def fake_get(url, **kwargs):
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            request=httpx.Request("GET", url),
        )

    monkeypatch.setattr(auditor.httpx, "get", fake_get)
    with pytest.raises(ValueError, match="HTML"):
        auditor.fetch_html("https://example.com")


def test_timeout_becomes_readable_cli_error(monkeypatch, capsys):
    def fake_get(url, **kwargs):
        raise httpx.ReadTimeout("Timed out")

    monkeypatch.setattr(auditor.httpx, "get", fake_get)
    monkeypatch.setattr(sys, "argv", ["auditor.py", "--url", "https://example.com"])
    assert auditor.main() == 2
    assert "Could not audit" in capsys.readouterr().err


@pytest.mark.parametrize(
    "filename,code,output",
    [
        ("good.html", 0, "Findings: 0"),
        ("broken.html", 1, "Findings: 5"),
        ("missing.html", 2, "Could not audit"),
    ],
)
def test_cli_file_flow(filename, code, output):
    result = subprocess.run(
        [sys.executable, "auditor.py", "--file", f"fixtures/{filename}"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == code
    assert output in result.stdout + result.stderr
