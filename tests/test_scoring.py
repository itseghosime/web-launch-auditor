from web_audit.scoring import compute_scan_score


def test_clean_score():
    pages = [{"findings": []}]
    assert compute_scan_score(pages) == 100


def test_warning_score():
    pages = [{"findings": [{"rule": "x", "severity": "warning"}]}]
    assert 0 <= compute_scan_score(pages) <= 100
    assert compute_scan_score(pages) == 95


def test_clamp():
    many = [
        {"findings": [{"rule": f"r{i}", "severity": "warning"} for i in range(100)]}
        for _ in range(5)
    ]
    assert compute_scan_score(many) == 0 or compute_scan_score(many) >= 0
