import argparse
import sys
from pathlib import Path

import httpx

from web_audit.checks import inspect_html
from web_audit.fetcher import fetch_page
from web_audit.reporting import to_json, to_text


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Inspect one HTML page.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--file", type=Path)
    source.add_argument("--url")
    parser.add_argument(
        "--base-url", help="Required for files: the page's intended URL"
    )
    parser.add_argument("--json", action="store_true", help="Print a JSON report")
    parser.add_argument("--output", type=Path, help="Save report to a NEW file")
    args = parser.parse_args(argv)
    if args.file is not None and not args.base_url:
        parser.error("--file requires --base-url so relative URLs can be resolved")
    if args.url is not None and args.base_url:
        parser.error("--base-url is only used with --file")

    try:
        if args.file is not None:
            html = args.file.read_text(encoding="utf-8")
            report = inspect_html(html, args.base_url, source="file")
        else:
            with httpx.Client(
                timeout=10.0, headers={"User-Agent": "WebLaunchAuditor/0.2"}
            ) as client:
                page = fetch_page(args.url, client)
            report = inspect_html(page.html, page.url, source="url")
            report.status_code = page.status_code
            report.redirects = page.redirects
        rendered = to_json(report) if args.json else to_text(report)
        if args.output is not None:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            with args.output.open("x", encoding="utf-8") as output:
                output.write(rendered + "\n")
        print(rendered)
    except (OSError, UnicodeError, ValueError, httpx.HTTPError) as error:
        print(f"Could not audit: {error}", file=sys.stderr)
        return 2
    return 1 if report.findings else 0
