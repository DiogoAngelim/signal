import { useState, useEffect } from "react";
import { signalQuery } from "../../api/client";

interface DecisionListItem {
  decisionId: string;
  domain: string;
  decision: string;
  status: string;
  recordedAt: string;
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
    <div>
      <h1 style={{ margin: "0 0 1.5rem", fontSize: "1.5rem" }}>Decisions</h1>
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        {loading ? <div style={{ color: "#666" }}>Loading decisions…</div> : (
          decisions.length === 0 ? (
            <div style={{ color: "#999" }}>No decisions recorded yet. Use "Evaluate Decision" to create one.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #eee", textAlign: "left" }}>
                  <th style={{ padding: "0.5rem" }}>ID</th>
                  <th style={{ padding: "0.5rem" }}>Domain</th>
                  <th style={{ padding: "0.5rem" }}>Decision</th>
                  <th style={{ padding: "0.5rem" }}>Status</th>
                  <th style={{ padding: "0.5rem" }}>Recorded</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((d) => (
                  <tr key={d.decisionId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "0.5rem" }}>{d.decisionId}</td>
                    <td style={{ padding: "0.5rem" }}>{d.domain}</td>
                    <td style={{ padding: "0.5rem" }}>{d.decision}</td>
                    <td style={{ padding: "0.5rem" }}>{d.status}</td>
                    <td style={{ padding: "0.5rem" }}>{d.recordedAt}</td>
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