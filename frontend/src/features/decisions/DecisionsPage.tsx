import { useState, useEffect } from "react";
import { signalQuery } from "../../api/client";

interface DecisionListItem {
  decisionId: string;
  domain: string;
  decision: string;
  status: string;
  recordedAt: string;
}

function StatusBadge({ status }: { status: string }) {
  const isCommit = status.toLowerCase() === "commit" || status.toLowerCase() === "passed" || status.toLowerCase() === "allowed";
  const isError = status.toLowerCase() === "reject" || status.toLowerCase() === "failed" || status.toLowerCase() === "denied";
  const color = isCommit ? "#16a34a" : isError ? "#dc2626" : "#ca8a04";
  const icon = isCommit ? "✓" : isError ? "✗" : "⚠";
  const label = status;
  return <span style={{ color, fontWeight: 600, letterSpacing: "0.02em" }}><span aria-hidden="true">{icon}</span> {label}</span>;
}

export function DecisionsPage() {
  const [decisions, setDecisions] = useState<DecisionListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    signalQuery<DecisionListItem[]>("decision.list.v1", {}).then((r) => {
      if (r.ok && Array.isArray(r.result)) setDecisions(r.result);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: "75ch" }}>
      <h1 style={{ margin: "0 0 2rem", fontSize: "2.25rem", fontWeight: 700, lineHeight: 1.25, letterSpacing: "0.04em", color: "#1a1a2e" }}>Decisions</h1>
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        {loading ? <div style={{ color: "#595959", fontSize: "1rem", lineHeight: 1.5 }}>Loading decisions…</div> : (
          decisions.length === 0 ? (
            <div style={{ color: "#6b6b6b", fontSize: "1rem", lineHeight: 1.65 }}>No decisions recorded yet. Use "Evaluate Decision" to create one.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "1rem", lineHeight: 1.5, letterSpacing: "0.02em" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
                  <th style={{ padding: "0.75rem", fontWeight: 600, letterSpacing: "0.02em", color: "#1a1a2e" }}>ID</th>
                  <th style={{ padding: "0.75rem", fontWeight: 600, letterSpacing: "0.02em", color: "#1a1a2e" }}>Domain</th>
                  <th style={{ padding: "0.75rem", fontWeight: 600, letterSpacing: "0.02em", color: "#1a1a2e" }}>Decision</th>
                  <th style={{ padding: "0.75rem", fontWeight: 600, letterSpacing: "0.02em", color: "#1a1a2e" }}>Status</th>
                  <th style={{ padding: "0.75rem", fontWeight: 600, letterSpacing: "0.02em", color: "#1a1a2e" }}>Recorded</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((d, i) => (
                  <tr key={d.decisionId} style={{ borderBottom: "1px solid #f0f1f3", background: i % 2 === 0 ? "#fff" : "#f8f9fa" }}>
                    <td style={{ padding: "0.75rem", color: "#444444" }}>{d.decisionId}</td>
                    <td style={{ padding: "0.75rem", color: "#444444" }}>{d.domain}</td>
                    <td style={{ padding: "0.75rem", color: "#444444" }}>{d.decision}</td>
                    <td style={{ padding: "0.75rem" }}><StatusBadge status={d.status} /></td>
                    <td style={{ padding: "0.75rem", color: "#595959" }}>{d.recordedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}