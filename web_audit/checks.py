from urllib.parse import urlsplit

from bs4 import BeautifulSoup

from web_audit.models import Finding, ScanReport, Severity
from web_audit.urls import normalize_url, resolve_url, same_origin


def inspect_html(
    html: str, page_url: str, source: str = "file", *, max_links: int = 500
) -> ScanReport:
    """Inspect one document; collect links without requesting their targets."""
    page_url = normalize_url(page_url)
    soup = BeautifulSoup(html, "html.parser")
    report = ScanReport(source=source, page_url=page_url, status_code=None)

    def add(
        rule: str,
        category: str,
        message: str,
        evidence: str,
        recommendation: str,
        severity: Severity = "warning",
    ) -> None:
        report.findings.append(
            Finding(
                rule=rule,
                category=category,
                severity=severity,
                message=message,
                evidence=evidence,
                recommendation=recommendation,
            )
        )

    title = soup.find("title")
    if title is None or not title.get_text(strip=True):
        add(
            "title.missing",
            "metadata",
            "Page title is missing or blank.",
            "No non-empty title found.",
            "Add a descriptive title in head.",
        )

    description = soup.find(
        "meta",
        attrs={
            "name": lambda name: isinstance(name, str) and name.lower() == "description"
        },
    )
    if description is None or not description.get("content", "").strip():
        add(
            "description.missing",
            "metadata",
            "Meta description is missing or blank.",
            "No non-empty description found.",
            "Write a concise page description.",
        )

    headings = soup.find_all("h1")
    if not headings:
        add(
            "h1.missing",
            "structure",
            "No h1 found.",
            "h1 count: 0.",
            "Review whether the page has a meaningful main heading.",
        )
    elif len(headings) > 1:
        add(
            "h1.multiple",
            "structure",
            "Multiple h1 elements found.",
            f"h1 count: {len(headings)}.",
            "Review the heading hierarchy.",
            "review",
        )
    elif not headings[0].get_text(strip=True):
        add(
            "h1.empty",
            "structure",
            "The h1 is blank.",
            "The h1 has no text.",
            "Give the main heading meaningful text.",
        )

    root = soup.find("html")
    if root is None or not root.get("lang", "").strip():
        add(
            "language.missing",
            "accessibility",
            "Document language is missing.",
            "No non-empty html lang attribute.",
            "Declare the document language.",
        )

    for index, image in enumerate(soup.find_all("img"), start=1):
        if not image.has_attr("alt"):
            add(
                "image.alt.missing",
                "accessibility",
                "Image has no alt attribute.",
                f"Image position: {index}.",
                "Review its purpose and supply appropriate alternative text.",
            )

    # HTML's first base href affects how relative URLs are resolved.
    base_url = page_url
    base = soup.find("base", href=True)
    if base is not None:
        try:
            base_url = resolve_url(page_url, base["href"])
        except ValueError:
            add(
                "base.invalid",
                "links",
                "The base URL is unsupported.",
                "Could not resolve base href.",
                "Use a valid HTTP(S) base URL.",
            )

    canonicals = soup.find_all(
        "link",
        rel=lambda rel: isinstance(rel, str) and "canonical" in rel.lower().split(),
    )
    if not canonicals:
        add(
            "canonical.missing",
            "metadata",
            "Canonical link is missing.",
            "No canonical link found.",
            "Review and set the preferred page URL.",
            "review",
        )
    else:
        if len(canonicals) > 1:
            add(
                "canonical.multiple",
                "metadata",
                "Multiple canonical links found.",
                f"Canonical count: {len(canonicals)}.",
                "Keep one consistent canonical.",
                "review",
            )
        try:
            href = canonicals[0].get("href", "").strip()
            if not href:
                raise ValueError("Blank canonical")
            resolve_url(base_url, href)
        except ValueError:
            add(
                "canonical.invalid",
                "metadata",
                "Canonical href is invalid or blank.",
                "First canonical could not be resolved.",
                "Use a valid page URL.",
            )

    for property_name in ("og:title", "og:description", "og:image", "og:url"):
        meta = soup.find("meta", attrs={"property": property_name})
        content = "" if meta is None else meta.get("content", "").strip()
        if not content:
            add(
                f"{property_name}.missing",
                "social",
                "Social metadata is missing.",
                f"Missing or blank {property_name}.",
                f"Add {property_name} metadata.",
                "review",
            )
        elif property_name in {"og:image", "og:url"}:
            try:
                normalize_url(content)  # These social URL fields should be absolute.
            except ValueError:
                add(
                    f"{property_name}.invalid",
                    "social",
                    "Social URL is invalid.",
                    f"{property_name} is not an absolute HTTP(S) URL.",
                    "Use an absolute URL that sharing platforms can retrieve.",
                    "review",
                )

    seen = set()
    for index, link in enumerate(
        soup.find_all("a", href=True, limit=max_links), start=1
    ):
        href = link.get("href", "").strip()
        if not href or href.startswith("#"):
            continue
        # These are deliberate non-web actions, not crawl targets.
        if href.lower().startswith(("mailto:", "tel:", "javascript:", "data:")):
            continue
        try:
            target = resolve_url(base_url, href)
        except ValueError:
            add(
                "link.invalid",
                "links",
                "An anchor URL could not be resolved.",
                f"Anchor position: {index}.",
                "Review the link destination.",
                "review",
            )
            continue
        if same_origin(page_url, target) and target not in seen:
            seen.add(target)
            report.internal_links.append(target)

    base_host = urlsplit(page_url).hostname or ""
    is_local_target = base_host in {
        "localhost",
        "127.0.0.1",
        "::1",
    } or base_host.endswith(".local")
    leak_tokens = ("localhost", "127.0.0.1", "0.0.0.0")
    if not is_local_target:
        for tag in soup.find_all(src=True):
            src = str(tag.get("src", "")).lower()
            if any(token in src for token in leak_tokens):
                add(
                    "localhost.leak",
                    "secrets",
                    "Localhost reference leaked in a production asset src.",
                    f"src={src}",
                    "Replace the localhost URL with a production endpoint.",
                    "warning",
                )
        for tag in soup.find_all(href=True):
            href = str(tag.get("href", "")).lower()
            if any(token in href for token in leak_tokens):
                add(
                    "localhost.leak",
                    "secrets",
                    "Localhost reference leaked in a production link.",
                    f"href={href}",
                    "Replace the localhost URL with a production endpoint.",
                    "warning",
                )

    text_blob = " ".join(soup.find_all(string=True)).lower()
    title_text = (title.get_text(" ", strip=True) if title else "").lower()
    combined = text_blob + " " + title_text
    for needle in ("lorem ipsum", "todo:", "fixme:", "create next app", "vite + react"):
        if needle in combined:
            add(
                "placeholder.text",
                "secrets",
                "Placeholder or scaffolding text found.",
                f" Matched '{needle}'.",
                "Replace placeholder text with production content.",
                "warning",
            )
            break
    for script in soup.find_all("script"):
        text = script.get_text(strip=True)
        src = script.get("src", "")
        if (
            src and str(src).lower().endswith(".map")
        ) or "sourcemapurl" in text.lower():
            add(
                "sourcemap.exposed",
                "secrets",
                "Source map reference exposed in production HTML.",
                f"script src={src}",
                "Remove sourceMappingURL hints and .map references before shipping.",
                "warning",
            )
            break
    for anchor in soup.find_all("a", href=True):
        raw = anchor.get("href", "").strip()
        lowered = raw.lower()
        if lowered in {"#", "javascript:void(0)", "javascript:void(0);", ""}:
            if not (anchor.get("role") == "button" or anchor.get("onclick")):
                add(
                    "link.dead_button",
                    "links",
                    "Empty or dead anchor detected.",
                    f"href={raw}",
                    "Use a <button> for actions or a valid href.",
                    "review",
                )
                break
        if lowered.startswith("mailto:") and "@" not in raw.split(":", 1)[-1]:
            add(
                "link.dead_button",
                "links",
                "Malformed mailto link detected.",
                f"href={raw}",
                "Fix the mailto: address.",
                "review",
            )
            break

    def _meta_content(prop=None, name=None):
        tag = None
        if prop:
            tag = soup.find("meta", attrs={"property": prop})
        if tag is None and name:
            tag = soup.find("meta", attrs={"name": name})
        return tag.get("content", "").strip() if tag is not None else ""

    report.social_preview = {
        "title": _meta_content("og:title")
        or (title.get_text(strip=True) if title else ""),
        "description": _meta_content("og:description"),
        "image": _meta_content("og:image"),
        "site_name": _meta_content("og:site_name"),
    }

    return report
