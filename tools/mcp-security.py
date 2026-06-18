#!/usr/bin/env python3
"""
MCP Security Server - local scanner bridge
Expose scan tools as MCP tools for Claude Code / Cursor agents
Runs on localhost:9991

Install: pip install fastmcp
Run: python tools/mcp-security.py
"""
from fastmcp import FastMCP
import subprocess, json, pathlib

mcp = FastMCP("security-scanner", port=9991)

@mcp.tool()
def run_semgrep(path: str = ".", config: str = "p/owasp-top-ten") -> dict:
    """Run Semgrep SAST scan. Returns SARIF-lite finding list."""
    result = subprocess.run(
        ["semgrep", "scan", f"--config={config}", "--severity=ERROR", "--json", path],
        capture_output=True, text=True
    )
    try:
        data = json.loads(result.stdout)
        findings = data.get("results", [])
        return {
            "status": "findings" if findings else "clean",
            "count": len(findings),
            "findings": [
                {"rule": f["check_id"], "file": f["path"],
                 "line": f["start"]["line"], "msg": f["extra"]["message"][:120]}
                for f in findings[:20]
            ]
        }
    except Exception as e:
        return {"status": "error", "error": str(e), "raw": result.stderr[:500]}

@mcp.tool()
def run_gitleaks(path: str = ".") -> dict:
    """Run gitleaks secret detection on working tree."""
    result = subprocess.run(
        ["gitleaks", "detect", "--source", path, "--exit-code", "1", "--json"],
        capture_output=True, text=True
    )
    try:
        leaks = json.loads(result.stdout) if result.stdout.strip() else []
        return {
            "status": "secrets_found" if leaks else "clean",
            "count": len(leaks),
            "leaks": [
                {"file": l.get("File"), "line": l.get("StartLine"),
                 "rule": l.get("RuleID"), "preview": l.get("Secret","")[:8]+"***"}
                for l in leaks
            ]
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}

@mcp.tool()
def run_bandit(path: str = ".") -> dict:
    """Run Bandit Python SAST. Returns HIGH+ findings."""
    result = subprocess.run(
        ["python", "-m", "bandit", "-r", path, "-ll", "-f", "json",
         "-x", "tests/,venv/,node_modules/,sam3_env/,audit_venv/"],
        capture_output=True, text=True
    )
    try:
        data = json.loads(result.stdout)
        issues = data.get("results", [])
        return {
            "status": "findings" if issues else "clean",
            "count": len(issues),
            "metrics": data.get("metrics", {}),
            "findings": [
                {"test": i["test_id"], "sev": i["issue_severity"],
                 "file": i["filename"], "line": i["line_number"],
                 "text": i["issue_text"][:100]}
                for i in issues[:20]
            ]
        }
    except Exception as e:
        return {"status": "error", "error": str(e), "raw": result.stderr[:500]}

@mcp.tool()
def digest_sarif(sarif_path: str) -> dict:
    """Parse a SARIF file and return structured finding summary."""
    p = pathlib.Path(sarif_path)
    if not p.exists():
        return {"error": f"File not found: {sarif_path}"}
    with open(p) as f:
        sarif = json.load(f)
    findings = []
    for run in sarif.get("runs", []):
        tool = run.get("tool",{}).get("driver",{}).get("name","unknown")
        for r in run.get("results", []):
            locs = r.get("locations", [{}])
            phys = locs[0].get("physicalLocation", {}) if locs else {}
            findings.append({
                "tool": tool, "rule": r.get("ruleId",""),
                "sev": r.get("level","warning"),
                "file": phys.get("artifactLocation",{}).get("uri","?"),
                "line": phys.get("region",{}).get("startLine",0),
                "msg": r.get("message",{}).get("text","")[:120],
            })
    return {"total": len(findings), "findings": findings[:50]}

@mcp.tool()
def scan_gate(path: str = ".") -> dict:
    """Run full scan gate: Semgrep + Gitleaks + Bandit. Returns pass/fail."""
    results = {}
    results["semgrep"] = run_semgrep(path)
    results["gitleaks"] = run_gitleaks(path)
    results["bandit"] = run_bandit(path)
    
    blocked = [k for k, v in results.items() 
               if v.get("status") not in ("clean", "error")]
    return {
        "gate": "BLOCKED" if blocked else "PASS",
        "blocked_by": blocked,
        "results": results,
    }

if __name__ == "__main__":
    print("[MCP Security Server] Starting on localhost:9991")
    print("Tools: run_semgrep, run_gitleaks, run_bandit, digest_sarif, scan_gate")
    mcp.run()
