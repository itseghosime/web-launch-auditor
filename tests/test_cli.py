import json
import subprocess
import sys
from pathlib import Path

import pytest

from web_audit.cli import main

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize(
    "filename,expected,findings",
    [
        ("good.html", 0, 0),
        ("broken.html", 1, 10),
    ],
)
def test_module_cli_json(filename, expected, findings):
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "web_audit",
            "--file",
            f"fixtures/{filename}",
            "--base-url",
            "https://example.com/",
            "--json",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == expected
    assert len(json.loads(result.stdout)["findings"]) == findings
    assert result.stderr == ""


def test_new_json_file_is_saved(tmp_path, capsys):
    output = tmp_path / "reports/result.json"
    code = main(
        [
            "--file",
            str(ROOT / "fixtures/good.html"),
            "--base-url",
            "https://example.com/",
            "--json",
            "--output",
            str(output),
        ]
    )
    assert code == 0
    assert json.loads(output.read_text())["page_url"] == "https://example.com/"
    assert json.loads(capsys.readouterr().out)["source"] == "file"


def test_existing_report_is_not_overwritten(tmp_path, capsys):
    output = tmp_path / "result.json"
    output.write_text("keep me", encoding="utf-8")
    code = main(
        [
            "--file",
            str(ROOT / "fixtures/good.html"),
            "--base-url",
            "https://example.com/",
            "--output",
            str(output),
        ]
    )
    assert code == 2
    assert output.read_text() == "keep me"
    assert "Could not audit" in capsys.readouterr().err


@pytest.mark.parametrize(
    "args",
    [
        [],
        ["--file", "fixtures/good.html"],
        ["--url", "https://example.com/", "--base-url", "https://example.com/"],
    ],
)
def test_invalid_cli_arguments(args):
    with pytest.raises(SystemExit) as error:
        main(args)
    assert error.value.code == 2


def test_missing_file_has_error_exit(capsys):
    assert (
        main(["--file", "nonexistent.html", "--base-url", "https://example.com/"]) == 2
    )
    assert "Could not audit" in capsys.readouterr().err
