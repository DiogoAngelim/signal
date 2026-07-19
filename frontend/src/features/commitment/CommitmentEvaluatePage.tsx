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
    <div style={{ maxWidth: "65ch" }}>
      <h1 style={{ margin: "0 0 2rem", fontSize: "2.25rem", fontWeight: 700, lineHeight: 1.25, letterSpacing: "0.04em", color: "#1a1a2e" }}>Commitment Evaluation</h1>
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <p style={{ color: "#595959", fontSize: "1rem", lineHeight: 1.65, letterSpacing: "0.02em", margin: "0 0 1.5rem" }}>
          Evaluate the current commitment state of the Signal system. Checks whether all invariants hold and operations are permitted.
        </p>
        <button onClick={handleEvaluate} disabled={loading}
          style={{ background: "#1a1a2e", color: "#fff", border: "none", padding: "0.75rem 1.5rem", borderRadius: 6, cursor: "pointer", fontSize: "1rem", fontWeight: 600, letterSpacing: "0.02em" }}>
          {loading ? "Evaluating…" : "Evaluate Commitment"}
        </button>
        {error && <div style={{ marginTop: "1rem", color: "#dc2626", fontSize: "1rem", lineHeight: 1.5, letterSpacing: "0.02em" }}><span aria-hidden="true">✗ </span>{error}</div>}
        {result && (
          <div style={{ marginTop: "1.5rem", padding: "1.25rem", background: "#f8f9fa", borderRadius: 6, fontSize: "1rem", lineHeight: 1.65, letterSpacing: "0.02em", color: "#444444" }}>
            <div style={{ marginBottom: "0.5rem" }}><strong style={{ color: "#1a1a2e" }}>Module:</strong> {result.module}</div>
            <div style={{ marginBottom: "0.5rem" }}><strong style={{ color: "#1a1a2e" }}>Operation:</strong> {result.operation}</div>
            <div style={{ marginBottom: "0.5rem" }}><strong style={{ color: "#1a1a2e" }}>Version:</strong> {result.version}</div>
            <div style={{ marginBottom: "0.5rem" }}><strong style={{ color: "#1a1a2e" }}>Decision:</strong> <span style={{ color: result.decision === "commit" ? "#16a34a" : "#dc2626", fontWeight: 600 }}><span aria-hidden="true">{result.decision === "commit" ? "✓ " : "✗ "}</span>{result.decision}</span></div>
            <div><strong style={{ color: "#1a1a2e" }}>Status:</strong> <span style={{ color: result.status === "allowed" ? "#16a34a" : "#dc2626", fontWeight: 600 }}><span aria-hidden="true">{result.status === "allowed" ? "✓ " : "✗ "}</span>{result.status}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}