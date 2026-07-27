import { useState, useMemo } from "react";
import {
  verifyEffects,
  type VerificationReport,
  type EffectVerificationResult,
} from "../../lib/tauri";

type FilterMode = "all" | "passed" | "failed";

export default function VerificationPanel() {
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");

  const runVerification = async () => {
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const r = await verifyEffects();
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const filteredResults = useMemo(() => {
    if (!report) return [];
    return report.results.filter((r) => {
      if (filter === "passed" && !r.overall_pass) return false;
      if (filter === "failed" && r.overall_pass) return false;
      if (search && !r.effect_id.includes(search) && !r.effect_name.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [report, filter, search]);

  const categoryStats = useMemo(() => {
    if (!report) return [];
    const cats: Record<string, { total: number; passed: number }> = {};
    for (const r of report.results) {
      if (!cats[r.category]) cats[r.category] = { total: 0, passed: 0 };
      cats[r.category].total++;
      if (r.overall_pass) cats[r.category].passed++;
    }
    return Object.entries(cats)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [report]);

  const passRate = report ? Math.round((report.passed / report.total_effects) * 100) : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        color: "var(--text-primary)",
        fontSize: 12,
        fontFamily: "var(--font-body)",
        padding: 8,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={runVerification}
          disabled={running}
          style={{
            padding: "4px 12px",
            fontSize: 11,
            borderRadius: 3,
            border: "none",
            cursor: running ? "wait" : "pointer",
            background: running ? "var(--surface-container-low)" : "rgba(255, 173, 224, 0.25)",
            color: running ? "var(--text-muted)" : "var(--accent-pink)",
            fontWeight: 600,
          }}
        >
          {running ? "Running..." : "Run Verification"}
        </button>
        {report && !running && (
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {report.passed}/{report.total_effects} passed ({passRate}%)
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: 8,
            borderRadius: 3,
            background: "rgba(255, 80, 80, 0.15)",
            color: "var(--accent-pink)",
            fontSize: 11,
          }}
        >
          {error}
        </div>
      )}

      {/* Summary dashboard */}
      {report && (
        <>
          {/* Overall stats */}
          <div
            style={{
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
            }}
          >
            <StatBadge label="Total" value={report.total_effects} color="var(--text-primary)" />
            <StatBadge label="Passed" value={report.passed} color="var(--accent-teal, #4ade80)" />
            <StatBadge label="Failed" value={report.failed} color="var(--accent-pink)" />
            <StatBadge label="Pass Rate" value={`${passRate}%`} color="var(--accent-cyan)" />
          </div>

          {/* Category breakdown */}
          <div
            style={{
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
              fontSize: 10,
              color: "var(--text-muted)",
            }}
          >
            {categoryStats.map((cat) => (
              <span
                key={cat.name}
                style={{
                  padding: "1px 6px",
                  borderRadius: 2,
                  background: "var(--surface-container-low)",
                }}
              >
                {cat.name}: {cat.passed}/{cat.total}
              </span>
            ))}
          </div>

          {/* Filter controls */}
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {(["all", "passed", "failed"] as FilterMode[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "2px 8px",
                  fontSize: 10,
                  borderRadius: 3,
                  border: "none",
                  cursor: "pointer",
                  background: filter === f ? "rgba(255, 173, 224, 0.25)" : "var(--surface-container-low)",
                  color: filter === f ? "var(--accent-pink)" : "var(--text-muted)",
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <input
              type="text"
              placeholder="Search effects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                padding: "2px 6px",
                fontSize: 10,
                borderRadius: 3,
                border: "1px solid var(--surface-container-high)",
                background: "var(--surface-container-low)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {/* Results table */}
          <div
            style={{
              overflowY: "auto",
              maxHeight: "400px",
              border: "1px solid var(--surface-container-high)",
              borderRadius: 3,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 10,
              }}
            >
              <thead
                style={{
                  position: "sticky",
                  top: 0,
                  background: "var(--surface-container)",
                  zIndex: 1,
                }}
              >
                <tr style={{ textAlign: "left" }}>
                  <th style={{ padding: "4px 6px", fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "4px 6px", fontWeight: 600 }}>Effect</th>
                  <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "center" }}>Crash</th>
                  <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "center" }}>Output</th>
                  <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "center" }}>Anim</th>
                  <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "center" }}>Mask</th>
                  <th style={{ padding: "4px 6px", fontWeight: 600, textAlign: "right" }}>ms</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((r) => (
                  <ResultRow key={r.effect_id} result={r} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!report && !running && !error && (
        <div style={{ fontSize: 10, color: "var(--text-muted)", padding: 8 }}>
          Click "Run Verification" to check all effects for crashes, empty output, animation, and mask
          correctness.
        </div>
      )}
    </div>
  );
}

function StatBadge({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "4px 12px",
        borderRadius: 3,
        background: "var(--surface-container-low)",
        minWidth: 60,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}

function CheckIcon({ pass }: { pass: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 14,
        height: 14,
        lineHeight: "14px",
        textAlign: "center",
        borderRadius: 2,
        fontSize: 9,
        fontWeight: 700,
        background: pass ? "rgba(74, 222, 128, 0.2)" : "rgba(255, 80, 80, 0.2)",
        color: pass ? "var(--accent-teal, #4ade80)" : "var(--accent-pink)",
      }}
    >
      {pass ? "✓" : "✗"}
    </span>
  );
}

function ResultRow({ result }: { result: EffectVerificationResult }) {
  const [expanded, setExpanded] = useState(false);
  const hasError = result.error_message !== null;

  return (
    <>
      <tr
        onClick={() => hasError && setExpanded(!expanded)}
        style={{
          cursor: hasError ? "pointer" : "default",
          borderBottom: "1px solid var(--surface-container-low)",
        }}
      >
        <td style={{ padding: "3px 6px" }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "1px 4px",
              borderRadius: 2,
              background: result.overall_pass
                ? "rgba(74, 222, 128, 0.15)"
                : "rgba(255, 80, 80, 0.15)",
              color: result.overall_pass ? "var(--accent-teal, #4ade80)" : "var(--accent-pink)",
            }}
          >
            {result.overall_pass ? "PASS" : "FAIL"}
          </span>
        </td>
        <td style={{ padding: "3px 6px" }}>
          <div style={{ fontWeight: 500 }}>{result.effect_name}</div>
          <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{result.effect_id}</div>
        </td>
        <td style={{ padding: "3px 6px", textAlign: "center" }}>
          <CheckIcon pass={result.checks.no_crash} />
        </td>
        <td style={{ padding: "3px 6px", textAlign: "center" }}>
          <CheckIcon pass={result.checks.non_empty_output} />
        </td>
        <td style={{ padding: "3px 6px", textAlign: "center" }}>
          <CheckIcon pass={result.checks.animates} />
        </td>
        <td style={{ padding: "3px 6px", textAlign: "center" }}>
          <CheckIcon pass={result.checks.mask_inside_correct && result.checks.mask_outside_correct} />
        </td>
        <td style={{ padding: "3px 6px", textAlign: "right", color: "var(--text-muted)" }}>
          {result.duration_ms}
        </td>
      </tr>
      {expanded && hasError && (
        <tr>
          <td colSpan={7} style={{ padding: "4px 6px", background: "var(--surface-container-low)" }}>
            <div style={{ fontSize: 9, color: "var(--accent-pink)" }}>{result.error_message}</div>
          </td>
        </tr>
      )}
    </>
  );
}
