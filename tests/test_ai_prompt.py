from web_audit.ai_prompt import build_ai_fix_prompt


def test_output_structure():
    scan = {
        "url": "https://example.com",
        "stack": "nextjs",
        "score": 90,
        "pages": [
            {
                "page_url": "https://example.com/",
                "findings": [
                    {
                        "rule": "title.missing",
                        "message": "no title",
                        "evidence": "x",
                        "recommendation": "add title",
                    }
                ],
            }
        ],
    }
    out = build_ai_fix_prompt(scan)
    assert "Target URL:" in out
    assert "Next.js" in out
    assert "Health Score: 90/100" in out
    assert "title.missing" in out
