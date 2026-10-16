import json

import pytest

from web_audit.checks import inspect_html
from web_audit.models import Finding, ScanReport
from web_audit.reporting import to_json, to_text

PAGE = "https://example.com/"


def test_good_page_has_zero_findings(good_html):
    report = inspect_html(good_html, PAGE)
    assert report.findings == []
    assert report.internal_links == [PAGE + "about", PAGE + "contact"]


def test_broken_page_preserves_original_five_rules_and_adds_metadata(broken_html):
    report = inspect_html(broken_html, PAGE)
    assert [finding.rule for finding in report.findings] == [
        "title.missing",
        "description.missing",
        "h1.missing",
        "language.missing",
        "image.alt.missing",
        "canonical.missing",
        "og:title.missing",
        "og:description.missing",
        "og:image.missing",
        "og:url.missing",
    ]
    assert report.internal_links == [PAGE + "about"]


@pytest.mark.parametrize(
    "before,after,rule",
    [
        ("<title>Example Studio</title>", "<title> </title>", "title.missing"),
        ('content="Websites for small teams."', 'content=" "', "description.missing"),
        ("<h1>Websites for small teams</h1>", "", "h1.missing"),
        ("<h1>Websites for small teams</h1>", "<h1> </h1>", "h1.empty"),
        ("</body>", "<h1>Extra</h1></body>", "h1.multiple"),
        ('lang="en"', 'lang=" "', "language.missing"),
        ('alt="Two designers discussing a page layout"', "", "image.alt.missing"),
        ('href="https://example.com/"', 'href=""', "canonical.invalid"),
        (
            'property="og:title" content="Example Studio"',
            'property="og:title"',
            "og:title.missing",
        ),
        (
            'content="https://example.com/social.png"',
            'content="/social.png"',
            "og:image.invalid",
        ),
        (
            'property="og:url" content="https://example.com/"',
            'property="og:url" content="/"',
            "og:url.invalid",
        ),
    ],
)
def test_individual_rules(good_html, before, after, rule):
    report = inspect_html(good_html.replace(before, after, 1), PAGE)
    assert [finding.rule for finding in report.findings] == [rule]


def test_description_name_is_case_insensitive(good_html):
    assert (
        inspect_html(
            good_html.replace('name="description"', 'name="DESCRIPTION"'), PAGE
        ).findings
        == []
    )


def test_relative_canonical_is_supported(good_html):
    assert (
        inspect_html(
            good_html.replace(
                'rel="canonical" href="https://example.com/"',
                'rel="canonical" href="/"',
            ),
            PAGE,
        ).findings
        == []
    )


def test_duplicate_canonical_is_review(good_html):
    html = good_html.replace("</head>", '<link rel="canonical" href="/other"></head>')
    report = inspect_html(html, PAGE)
    assert [item.rule for item in report.findings] == ["canonical.multiple"]
    assert report.findings[0].severity == "review"


def test_link_queries_are_preserved_and_fragments_deduplicated(good_html):
    html = good_html.replace(
        "</body>",
        '<a href="/about?tab=1#top">A</a><a href="/about?tab=1#end">B</a></body>',
    )
    report = inspect_html(html, PAGE)
    assert report.internal_links == [
        PAGE + "about",
        PAGE + "contact",
        PAGE + "about?tab=1",
    ]


def test_external_base_is_respected_but_links_stay_same_origin(good_html):
    html = good_html.replace(
        "</head>", '<base href="https://external.example/"></head>'
    )
    assert inspect_html(html, PAGE).internal_links == []


def test_relative_base_resolves_links(good_html):
    html = good_html.replace("</head>", '<base href="/docs/"></head>').replace(
        "</body>", '<a href="guide">Guide</a></body>'
    )
    assert inspect_html(html, PAGE).internal_links[-1] == PAGE + "docs/guide"


def test_invalid_link_has_review_finding(good_html):
    html = good_html.replace("</body>", '<a href="https://[bad">Bad</a></body>')
    assert [item.rule for item in inspect_html(html, PAGE).findings] == ["link.invalid"]


def test_skips_non_web_and_fragment_links(good_html):
    html = good_html.replace(
        "</body>",
        '<a href="tel:123">Call</a><a href="javascript:void(0)">Do</a><a href="">Empty</a></body>',
    )
    assert inspect_html(html, PAGE).internal_links == [PAGE + "about", PAGE + "contact"]


def test_result_lists_are_independent():
    first = ScanReport("file", PAGE, None)
    second = ScanReport("file", PAGE, None)
    first.findings.append(Finding("a", "metadata", "review", "m", "e", "r"))
    assert second.findings == []


def test_json_round_trip_and_text(good_html):
    report = inspect_html(good_html, PAGE)
    data = json.loads(to_json(report))
    assert data["schema_version"] == "0.2"
    assert data["status_code"] is None
    assert data["findings"] == []
    assert "Internal links discovered (not fetched): 2" in to_text(report)


def test_social_preview_survives_serialization(good_html):
    # asdict() only walks declared fields, so social_preview must be one or the
    # crawler drops it and the UI wrongly reports a missing og:image.
    report = inspect_html(good_html, PAGE)
    data = json.loads(to_json(report))
    assert data["social_preview"] == {
        "title": "Example Studio",
        "description": "Websites for small teams.",
        "image": "https://example.com/social.png",
        "site_name": "",
    }


def test_social_preview_defaults_to_none_without_og_tags(broken_html):
    assert inspect_html(broken_html, PAGE).social_preview is not None
    assert json.loads(to_json(inspect_html(broken_html, PAGE)))["social_preview"][
        "image"
    ] == ""
