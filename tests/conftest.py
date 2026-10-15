from pathlib import Path

import pytest

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


@pytest.fixture
def good_html():
    return (FIXTURES / "good.html").read_text(encoding="utf-8")


@pytest.fixture
def broken_html():
    return (FIXTURES / "broken.html").read_text(encoding="utf-8")
