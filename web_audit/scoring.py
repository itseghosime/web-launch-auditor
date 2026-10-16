"""Deterministic health scoring for scans."""

PENALTIES = {
    "warning": 5,
    "review": 3,
}
RULE_CAP = 15  # max deduction per unique rule across the whole scan


def _severity_weight(finding):
    sev = (
        finding.get("severity", "warning")
        if isinstance(finding, dict)
        else getattr(finding, "severity", "warning")
    )
    return PENALTIES.get(sev, 5)


def compute_scan_score(pages):
    score = 100
    per_rule = {}
    for page in pages or []:
        for f in page.get("findings", []) if isinstance(page, dict) else []:
            rule = f.get("rule") if isinstance(f, dict) else getattr(f, "rule", None)
            if not rule:
                continue
            per_rule.setdefault(rule, 0)
            add = _severity_weight(f)
            if per_rule[rule] + add > RULE_CAP:
                add = max(0, RULE_CAP - per_rule[rule])
            per_rule[rule] += add
            score -= add
    return max(0, min(100, score))
