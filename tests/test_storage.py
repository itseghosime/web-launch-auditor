import pytest

from web_audit.storage import QueueFull, Storage
from web_audit.worker import Worker


def test_durable_queue_ownership_and_recovery(tmp_path):
    path = tmp_path / "scans.sqlite3"
    store = Storage(path)
    scan = store.create("owner", "https://example.com", 5, 1)
    assert store.get(scan["id"], "stranger") is None
    assert store.list("stranger") == []
    assert store.claim()["id"] == scan["id"]
    assert store.claim() is None
    restarted = Storage(path)
    restarted.recover()
    assert restarted.claim()["id"] == scan["id"]
    restarted.finish(scan["id"], {"pages": [{"findings": [{"rule": "title"}]}]})
    saved = restarted.get(scan["id"], "owner")
    assert saved["status"] == "completed"
    assert saved["pages_scanned"] == saved["findings_count"] == 1
    assert not restarted.delete(scan["id"], "stranger")
    assert restarted.delete(scan["id"], "owner")


def test_queue_limits(tmp_path):
    store = Storage(tmp_path / "scans.sqlite3")
    for _ in range(3):
        store.create("owner", "https://example.com", 1, 0)
    with pytest.raises(QueueFull):
        store.create("owner", "https://example.com", 1, 0)
    for index in range(17):
        store.create(str(index), "https://example.com", 1, 0)
    with pytest.raises(QueueFull):
        store.create("new", "https://example.com", 1, 0)


def test_worker_failure_is_saved_and_next_job_can_run(tmp_path):
    store = Storage(tmp_path / "scans.sqlite3")
    scan = store.create("owner", "https://example.com", 1, 0)

    def fail(*args, **kwargs):
        raise RuntimeError("private internal information")

    worker = Worker(store, fail)
    assert worker.run_once()
    result = store.get(scan["id"], "owner")
    assert result["status"] == "failed"
    assert "private" not in result["error"]
    assert not worker.run_once()


def test_retention_keeps_history_bounded(tmp_path, monkeypatch):
    store = Storage(tmp_path / "scans.sqlite3")
    for index in range(485):
        monkeypatch.setattr("web_audit.storage.time", lambda: index * 601)
        scan = store.create("owner", "https://example.com", 1, 0)
        store.finish(scan["id"], {"pages": []})
    with store.connect() as db:
        assert db.execute("SELECT count(*) FROM scans").fetchone()[0] == 480
    assert len(store.list("owner")) == 100


def test_worker_records_progress_and_first_page_failure(tmp_path):
    store = Storage(tmp_path / "scans.sqlite3")
    scan = store.create("owner", "https://example.com", 1, 0)

    def crawl(url, max_pages, max_depth, on_page):
        page = {"page_url": url, "findings": [], "error": "Website returned HTTP 404."}
        on_page(page)
        assert store.get(scan["id"], "owner")["pages_scanned"] == 1
        return {"pages": [page], "stop_reason": "finished"}

    Worker(store, crawl).run_once()
    result = store.get(scan["id"], "owner")
    assert result["status"] == "failed"
    assert result["pages_scanned"] == 1
    assert result["error"] == "Website returned HTTP 404."


def test_concurrent_claims_do_not_duplicate_jobs(tmp_path):
    from concurrent.futures import ThreadPoolExecutor

    store = Storage(tmp_path / "scans.sqlite3")
    for index in range(10):
        store.create(str(index), "https://example.com", 1, 0)
    with ThreadPoolExecutor(max_workers=10) as pool:
        claimed = list(pool.map(lambda _: store.claim(), range(10)))
    assert len({scan["id"] for scan in claimed}) == 10
    assert store.claim() is None


def test_global_rate_limit_survives_cookie_rotation_deletion_and_restart(
    tmp_path, monkeypatch
):
    path = tmp_path / "scans.sqlite3"
    store = Storage(path)
    monkeypatch.setattr("web_audit.storage.time", lambda: 1000)
    for index in range(30):
        owner = str(index)
        scan = store.create(owner, "https://example.com", 1, 0)
        store.finish(scan["id"], {"pages": []})
        store.delete(scan["id"], owner)
    restarted = Storage(path)
    with pytest.raises(QueueFull):
        restarted.create("rotated-cookie", "https://example.com", 1, 0)
    monkeypatch.setattr("web_audit.storage.time", lambda: 1601)
    assert restarted.create("rotated-cookie", "https://example.com", 1, 0)
    with restarted.connect() as db:
        assert db.execute("SELECT count(*) FROM admissions").fetchone()[0] == 1


@pytest.mark.parametrize(
    "exception", [ValueError("Safe error"), RuntimeError("Private")]
)
def test_worker_preserves_progress_on_exception(tmp_path, exception):
    store = Storage(tmp_path / "scans.sqlite3")
    scan = store.create("owner", "https://example.com", 2, 1)
    page = {"page_url": "https://example.com", "findings": [{"rule": "title"}]}

    def failing_crawl(url, max_pages, max_depth, on_page):
        on_page(page)
        raise exception

    Worker(store, failing_crawl).run_once()
    saved = store.get(scan["id"], "owner")
    assert saved["status"] == "failed"
    assert saved["pages"] == [page]
    assert saved["pages_scanned"] == saved["findings_count"] == 1
    assert "Private" not in saved["error"]
