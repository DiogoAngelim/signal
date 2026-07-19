import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { signalQuery } from "../../api/client";

interface DecisionDetail {
  decisionId: string;
  domain: string;
  decision: string;
  status: string;
  evidence: Array<{ name: string; weight: number; description: string }>;
  recordedAt: string;
}

function StatusBadge({ status }: { status: string }) {
  const isCommit = status.toLowerCase() === "commit" || status.toLowerCase() === "passed" || status.toLowerCase() === "allowed";
  const isError = status.toLowerCase() === "reject" || status.toLowerCase() === "failed" || status.toLowerCase() === "denied";
  const color = isCommit ? "#16a34a" : isError ? "#dc2626" : "#ca8a04";
  const icon = isCommit ? "✓" : isError ? "✗" : "⚠";
  return <span style={{ color, fontWeight: 600, letterSpacing: "0.02em" }}><span aria-hidden="true">{icon}</span> {status}</span>;
}

export function DecisionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<DecisionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    signalQuery<DecisionDetail>("decision.get.v1", { decisionId: id }).then((r) => {
      if (r.ok) setDetail(r.result);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ color: "#595959", fontSize: "1rem", lineHeight: 1.5 }}>Loading decision…</div>;
  if (!detail) return <div style={{ color: "#6b6b6b", fontSize: "1rem", lineHeight: 1.5 }}>Decision not found: {id}</div>;

  return (
    <div style={{ maxWidth: "65ch" }}>
      <h1 style={{ margin: "0 0 2rem", fontSize: "2.25rem", fontWeight: 700, lineHeight: 1.25, letterSpacing: "0.04em", color: "#1a1a2e" }}>Decision Detail</h1>
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <div style={{ fontSize: "1rem", lineHeight: 1.65, letterSpacing: "0.02em", color: "#444444" }}>
          <div style={{ marginBottom: "0.75rem" }}><strong style={{ color: "#1a1a2e" }}>ID:</strong> {detail.decisionId}</div>
          <div style={{ marginBottom: "0.75rem" }}><strong style={{ color: "#1a1a2e" }}>Domain:</strong> {detail.domain}</div>
          <div style={{ marginBottom: "0.75rem" }}><strong style={{ color: "#1a1a2e" }}>Decision:</strong> {detail.decision}</div>
          <div style={{ marginBottom: "0.75rem" }}><strong style={{ color: "#1a1a2e" }}>Status:</strong> <StatusBadge status={detail.status} /></div>
          <div style={{ marginBottom: "0.75rem" }}><strong style={{ color: "#1a1a2e" }}>Recorded:</strong> {detail.recordedAt}</div>
        </div>
        {detail.evidence && detail.evidence.length > 0 && (
          <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid #e5e7eb" }}>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.3, letterSpacing: "0.02em", margin: "0 0 1rem", color: "#1a1a2e" }}>Evidence</h3>
            {detail.evidence.map((e, i) => (
              <div key={i} style={{ background: "#f8f9fa", borderRadius: 6, padding: "1rem", marginBottom: "0.75rem", fontSize: "1rem", lineHeight: 1.65, letterSpacing: "0.02em", color: "#444444" }}>
                <strong style={{ color: "#1a1a2e" }}>{e.name}</strong> <span style={{ color: "#595959", fontSize: "0.9375rem" }}>(weight: {e.weight})</span>
                <div style={{ marginTop: "0.25rem" }}>{e.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}