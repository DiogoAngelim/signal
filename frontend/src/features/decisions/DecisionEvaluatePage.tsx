import { useState } from "react";
import { signalQuery } from "../../api/client";

interface EvaluationResult {
  decisionId: string;
  domain: string;
  decision: string;
  status: string;
  evidence: Array<{ name: string; weight: number; description: string }>;
}

export function DecisionEvaluatePage() {
  const [domain, setDomain] = useState("signal.decision");
  const [context, setContext] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleEvaluate() {
    setLoading(true);
    setError(null);
    try {
      const input = { domain, context: JSON.parse(context) };
      const r = await signalQuery<EvaluationResult>("decision.evaluate.v1", input);
      if (r.ok) setResult(r.result);
      else setError(r.error.message);
    } catch (e) {
      setError("Invalid JSON in context field");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 1.5rem", fontSize: "1.5rem" }}>Evaluate Decision</h1>
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", maxWidth: 600 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Domain</label>
          <input value={domain} onChange={(e) => setDomain(e.target.value)}
            style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #ddd", borderRadius: 6, fontSize: "0.9rem" }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Context (JSON)</label>
          <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={6}
            style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #ddd", borderRadius: 6, fontSize: "0.85rem", fontFamily: "monospace", resize: "vertical" }} />
        </div>
        <button onClick={handleEvaluate} disabled={loading}
          style={{ background: "#1a1a2e", color: "#fff", border: "none", padding: "0.6rem 1.5rem", borderRadius: 6, cursor: "pointer", fontSize: "0.875rem" }}>
          {loading ? "Evaluating…" : "Evaluate"}
        </button>
        {error && <div style={{ marginTop: 12, color: "#dc2626", fontSize: "0.85rem" }}>{error}</div>}
        {result && (
          <div style={{ marginTop: 16, padding: "1rem", background: "#f9f9f9", borderRadius: 6, fontSize: "0.85rem" }}>
            <div><strong>Decision ID:</strong> {result.decisionId}</div>
            <div><strong>Domain:</strong> {result.domain}</div>
            <div><strong>Decision:</strong> {result.decision}</div>
            <div><strong>Status:</strong> {result.status}</div>
          </div>
        )}
      </div>
    </div>
  );
}