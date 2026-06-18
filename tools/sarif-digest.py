#!/usr/bin/env python3
"""
sarif-digest.py -- Aggregate multi-tool SARIF into one prioritized report
Usage: python sarif-digest.py semgrep.sarif bandit.sarif snyk-code.sarif
"""
import json, sys, pathlib
from collections import defaultdict

VULN_MAP = {
    "sql": "SQL Injection", "injection": "SQL Injection",
    "xss": "XSS", "cross-site": "XSS",
    "exec": "RCE", "command": "RCE", "rce": "RCE", "os-command": "RCE",
    "path": "Path Traversal", "traversal": "Path Traversal",
    "secret": "Hardcoded Secret", "hardcode": "Hardcoded Secret", "credential": "Hardcoded Secret",
    "crypto": "Weak Crypto", "weak-hash": "Weak Crypto", "md5": "Weak Crypto",
}

SEV_RANK = {"error": 0, "critical": 0, "warning": 1, "high": 1, "note": 2, "low": 2}

def classify(rule_id: str, msg: str) -> str:
    text = (rule_id + " " + msg).lower()
    for kw, cat in VULN_MAP.items():
        if kw in text:
            return cat
    return "Other"

def parse_sarif(path: str) -> list[dict]:
    findings = []
    with open(path) as f:
        sarif = json.load(f)
    tool_name = path.split(".")[0]
    for run in sarif.get("runs", []):
        tool_name = run.get("tool", {}).get("driver", {}).get("name", tool_name)
        results = run.get("results", [])
        rules = {r["id"]: r for r in run.get("tool", {}).get("driver", {}).get("rules", [])}
        for r in results:
            rid = r.get("ruleId", "unknown")
            msg = r.get("message", {}).get("text", "")
            sev = r.get("level", "warning").lower()
            for loc in r.get("locations", [{}]):
                phys = loc.get("physicalLocation", {})
                uri = phys.get("artifactLocation", {}).get("uri", "?")
                line = phys.get("region", {}).get("startLine", 0)
                findings.append({
                    "tool": tool_name, "rule": rid, "sev": sev,
                    "file": uri, "line": line, "msg": msg,
                    "category": classify(rid, msg),
                })
    return findings

def main():
    all_findings = []
    for path in sys.argv[1:]:
        if pathlib.Path(path).exists():
            all_findings.extend(parse_sarif(path))

    # Deduplicate by (category, file, line)
    seen = set()
    deduped = []
    for f in all_findings:
        key = (f["category"], f["file"], f["line"])
        if key not in seen:
            seen.add(key)
            deduped.append(f)

    # Group by category, sort by severity
    grouped = defaultdict(list)
    for f in deduped:
        grouped[f["category"]].append(f)

    print("\n" + "=" * 50)
    print(" SARIF DIGEST - Security Finding Summary")
    print(f" Tools: {', '.join(sys.argv[1:])}")
    print(f" Total unique findings: {len(deduped)}")
    print("=" * 50 + "\n")

    for category in ["SQL Injection","XSS","RCE","Path Traversal","Hardcoded Secret","Weak Crypto","Other"]:
        items = sorted(grouped.get(category, []), key=lambda x: SEV_RANK.get(x["sev"], 9))
        if not items:
            continue
        icon = {"SQL Injection":"O","XSS":"X","RCE":"!!","Path Traversal":"F",
                "Hardcoded Secret":"K","Weak Crypto":"?"}.get(category, "!")
        print(f"{icon} {category} ({len(items)})")
        for item in items[:10]:  # cap per category
            sev_icon = "!!" if item["sev"] in ("error","critical") else "!"
            print(f"  {sev_icon} [{item['tool']}] {item['file']}:{item['line']} - {item['msg'][:80]}")
        if len(items) > 10:
            print(f"  ... +{len(items)-10} more (run full report for details)")
        print()

if __name__ == "__main__":
    main()
