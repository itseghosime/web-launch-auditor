# Web Launch Auditor — week-two prototype

A local Python command-line tool for inspecting one HTML document. It reports
basic metadata, document-structure and image-alt omissions, checks canonical and
Open Graph fields, and discovers internal URLs for later crawling.

## Setup

Use Python 3.11 or newer. Run from this directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

## Run

```bash
python -m web_audit --file fixtures/good.html --base-url https://example.com/
python -m web_audit --url https://www.itseghosime.com/
python -m web_audit --file fixtures/broken.html --base-url https://example.com/ --json
python -m web_audit --file fixtures/good.html --base-url https://example.com/ --json --output reports/good.json
```

`--output` creates a new file; it does not overwrite existing reports. Supply a
base URL for file scans so relative links resolve against the intended page.

Exit codes: 0 = no findings under the implemented rules, 1 = findings, 2 = failed
execution or invalid arguments. The good fixture has zero findings and two
internal links. The broken fixture has ten findings and one internal link.

## Architecture

`models` describes results; `urls` handles URL syntax; `checks` inspects HTML;
`fetcher` reads network responses; `reporting` renders results; `cli` coordinates
the local command. The checks do not make network requests.

## Tests and style

```bash
python -m pip check
python -m ruff check .
python -m ruff format --check .
python -m pytest -q
```

The reference suite has 67 cases. HTTP scenarios use MockTransport rather than
external websites. GitHub Actions runs these checks on Python 3.11 and 3.12 when
this project is placed at the repository root and pushed.

## Current limits

This is a local learning prototype, not a publicly deployed scanning service.
It reads server HTML without JavaScript, handles up to five same-origin redirect
hops, and caps accumulated decoded HTML at 1,000,000 bytes. This cap is not a
complete memory budget. Its request timeout is not a total scan deadline.

It discovers internal links but does not fetch them to detect broken links.
Social-image presence does not prove that the image can be fetched. Findings
are limited machine checks and review suggestions, not certification of SEO or
accessibility. Manual review remains necessary.

URL syntax checks and same-origin redirects do not provide full destination
protection. Private-network restrictions, DNS/redirect safety, broader resource
controls and rate policy must be addressed before accepting arbitrary public
scan requests. API, crawling, persistence and the dashboard follow in later weeks.
