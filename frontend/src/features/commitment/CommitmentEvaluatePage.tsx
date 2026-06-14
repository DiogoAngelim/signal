import { useState } from "react";
import { evaluateCommitment } from "../../api/client";
import type { CommitmentResult } from "../../../../contracts/domain-types";

export function CommitmentEvaluatePage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CommitmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleEvaluate() {
    setLoading(true);
    setError(null);
    const r = await evaluateCommitment({});
    if (r.ok) setResult(r.result);
    else setError(r.error.message);
    setLoading(false);
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 1.5rem", fontSize: "1.5rem" }}>Commitment Evaluation</h1>
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", maxWidth: 600 }}>
        <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: 16 }}>
          Evaluate the current commitment state of the Signal system. Checks whether all invariants hold and operations are permitted.
        </p>
        <button onClick={handleEvaluate} disabled={loading}
          style={{ background: "#1a1a2e", color: "#fff", border: "none", padding: "0.6rem 1.5rem", borderRadius: 6, cursor: "pointer", fontSize: "0.875rem" }}>
          {loading ? "Evaluating…" : "Evaluate Commitment"}
        </button>
        {error && <div style={{ marginTop: 12, color: "#dc2626", fontSize: "0.85rem" }}>{error}</div>}
        {result && (
          <div style={{ marginTop: 16, padding: "1rem", background: "#f9f9f9", borderRadius: 6, fontSize: "0.85rem" }}>
            <div style={{ marginBottom: 4 }}><strong>Module:</strong> {result.module}</div>
            <div style={{ marginBottom: 4 }}><strong>Operation:</strong> {result.operation}</div>
            <div style={{ marginBottom: 4 }}><strong>Version:</strong> {result.version}</div>
            <div style={{ marginBottom: 4 }}><strong>Decision:</strong> <span style={{ color: result.decision === "commit" ? "#16a34a" : "#dc2626" }}>{result.decision}</span></div>
            <div><strong>Status:</strong> <span style={{ color: result.status === "allowed" ? "#16a34a" : "#dc2626" }}>{result.status}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}