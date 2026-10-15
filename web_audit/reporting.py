import json
from dataclasses import asdict

from web_audit.models import ScanReport


def to_json(report: ScanReport) -> str:
    return json.dumps(asdict(report), indent=2, ensure_ascii=False)


def to_text(report: ScanReport) -> str:
    lines = [
        f"Page: {report.page_url}",
        f"Findings: {len(report.findings)}",
        f"Internal links discovered (not fetched): {len(report.internal_links)}",
        f"Redirects followed: {len(report.redirects)}",
    ]
    for finding in report.findings:
        lines.extend(
            [
                f"- [{finding.severity}] {finding.rule}: {finding.message}",
                f"  Evidence: {finding.evidence}",
                f"  Next: {finding.recommendation}",
            ]
        )
    lines.append(
        "Limited automated checks; manual accessibility review is still needed."
    )
    return "\n".join(lines)
