import pytest
from fastapi.testclient import TestClient

from web_audit.api import create_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.delenv("AUDITOR_API_KEY", raising=False)

    def fake_crawl(url, max_pages, max_depth, on_page=None):
        return {
            "pages": [{"page_url": url, "findings": [{"rule": "title"}]}],
            "stop_reason": "complete",
        }

    app = create_app(tmp_path / "scans.sqlite3", fake_crawl, start_worker=False)
    with TestClient(app) as test_client:
        yield test_client


def test_complete_lifecycle(client):
    assert client.get("/health").json() == {"status": "ok"}
    response = client.post("/api/scans", json={"url": "https://example.com"})
    assert response.status_code == 202
    assert "HttpOnly" in response.headers["set-cookie"]
    scan_id = response.json()["id"]
    assert response.json()["status"] == "queued"
    assert client.delete(f"/api/scans/{scan_id}").status_code == 409
    assert client.app.state.worker.run_once()
    saved = client.get(f"/api/scans/{scan_id}").json()
    assert saved["status"] == "completed"
    assert saved["findings_count"] == 1
    history = client.get("/api/scans").json()["items"]
    assert len(history) == 1
    assert "pages" not in history[0]
    exported = client.get(f"/api/scans/{scan_id}/export")
    assert "attachment" in exported.headers["content-disposition"]
    assert exported.json() == saved
    assert client.delete(f"/api/scans/{scan_id}").status_code == 204
    assert client.get(f"/api/scans/{scan_id}").status_code == 404


def test_export_filename_uses_audited_site(client):
    scan = client.post(
        "/api/scans", json={"url": "https://www.example.com/pricing"}
    ).json()
    client.app.state.worker.run_once()
    exported = client.get(f"/api/scans/{scan['id']}/export")
    assert (
        'filename="example.com-audit.json"' in exported.headers["content-disposition"]
    )


def test_session_isolates_history_detail_export_delete(client):
    scan = client.post("/api/scans", json={"url": "https://example.com"}).json()
    client.app.state.worker.run_once()
    client.cookies.clear()
    assert client.get("/api/scans").json() == {"items": []}
    path = f"/api/scans/{scan['id']}"
    assert client.get(path).status_code == 404
    assert client.get(path + "/export").status_code == 404
    assert client.delete(path).status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"url": "file:///etc/passwd"},
        {"url": "http://127.0.0.1"},
        {"url": "http://localhost"},
        {"url": "https://user:pass@example.com"},
        {"url": "https://example.com", "max_pages": 21},
        {"url": "https://example.com", "max_depth": -1},
        {"url": "https://example.com:invalid"},
        {"url": "example.com"},
    ],
)
def test_validation(client, body):
    assert client.post("/api/scans", json=body).status_code == 422


def test_capacity_returns_retry_after(client):
    for _ in range(3):
        assert (
            client.post("/api/scans", json={"url": "https://example.com"}).status_code
            == 202
        )
    response = client.post("/api/scans", json={"url": "https://example.com"})
    assert response.status_code == 429
    assert response.headers["retry-after"] == "30"


def test_optional_api_key(client, monkeypatch):
    monkeypatch.setenv("AUDITOR_API_KEY", "test-shared-key")
    assert client.get("/api/scans").status_code == 401
    assert (
        client.get("/api/scans", headers={"x-api-key": "test-shared-key"}).status_code
        == 200
    )
    assert client.get("/health").status_code == 200


def test_analyze_raw_html_single_page(client):
    payload = {
        "url": "http://localhost:3000",
        "pages": [
            {
                "url": "http://localhost:3000/",
                "status": 200,
                "html": "<html><head><title>T</title></head><body>ok</body></html>",
            }
        ],
    }
    response = client.post("/api/analyze-raw-html", json=payload)
    assert response.status_code == 201
    scan = response.json()
    assert scan["status"] == "completed"
    assert scan["source"] == "relay"


def test_analyze_raw_html_oversized_rejected(client):
    html = "<html><body>" + ("x" * 1_000_001) + "</body></html>"
    payload = {
        "url": "http://localhost:3000",
        "pages": [{"url": "http://localhost:3000/", "status": 200, "html": html}],
    }
    response = client.post("/api/analyze-raw-html", json=payload)
    assert response.status_code in (413, 422)


def test_analyze_raw_html_non_html_rejected(client):
    payload = {
        "url": "http://localhost:3000",
        "pages": [
            {"url": "http://localhost:3000/", "status": 200, "html": "binary\x00data"}
        ],
    }
    response = client.post("/api/analyze-raw-html", json=payload)
    assert response.status_code in (400, 422)


def test_oversized_body_is_rejected_before_json_parsing(tmp_path):
    with TestClient(
        create_app(tmp_path / "limit.sqlite", start_worker=False)
    ) as client:
        response = client.post(
            "/api/scans",
            content=b"x" * 4097,
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 413
