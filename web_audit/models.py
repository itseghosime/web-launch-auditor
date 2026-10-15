from dataclasses import dataclass, field
from typing import Literal

Severity = Literal["warning", "review"]


@dataclass(frozen=True)
class Finding:
    rule: str
    category: str
    severity: Severity
    message: str
    evidence: str
    recommendation: str


@dataclass(frozen=True)
class Redirect:
    source: str
    status: int
    target: str


@dataclass
class FetchedPage:
    url: str
    status_code: int
    html: str
    redirects: list[Redirect] = field(default_factory=list)


@dataclass
class ScanReport:
    source: str
    page_url: str
    status_code: int | None
    findings: list[Finding] = field(default_factory=list)
    internal_links: list[str] = field(default_factory=list)
    redirects: list[Redirect] = field(default_factory=list)
    schema_version: str = "0.2"
