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

  if (loading) return <div style={{ color: "#666" }}>Loading decision…</div>;
  if (!detail) return <div style={{ color: "#999" }}>Decision not found: {id}</div>;

  return (
    <div>
      <h1 style={{ margin: "0 0 1.5rem", fontSize: "1.5rem" }}>Decision Detail</h1>
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", maxWidth: 700 }}>
        <div style={{ fontSize: "0.9rem", color: "#444" }}>
          <div style={{ marginBottom: 8 }}><strong>ID:</strong> {detail.decisionId}</div>
          <div style={{ marginBottom: 8 }}><strong>Domain:</strong> {detail.domain}</div>
          <div style={{ marginBottom: 8 }}><strong>Decision:</strong> {detail.decision}</div>
          <div style={{ marginBottom: 8 }}><strong>Status:</strong> {detail.status}</div>
          <div style={{ marginBottom: 8 }}><strong>Recorded:</strong> {detail.recordedAt}</div>
        </div>
        {detail.evidence && detail.evidence.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: "0.95rem", marginBottom: 8 }}>Evidence</h3>
            {detail.evidence.map((e, i) => (
              <div key={i} style={{ background: "#f9f9f9", borderRadius: 6, padding: "0.75rem", marginBottom: 6, fontSize: "0.85rem" }}>
                <strong>{e.name}</strong> (weight: {e.weight}) — {e.description}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}