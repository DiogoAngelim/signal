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
    <div style={{ maxWidth: "65ch" }}>
      <h1 style={{ margin: "0 0 2rem", fontSize: "2.25rem", fontWeight: 700, lineHeight: 1.25, letterSpacing: "0.04em", color: "#1a1a2e" }}>Evaluate Decision</h1>
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: 6, color: "#1a1a2e", letterSpacing: "0.02em" }}>Domain</label>
          <input value={domain} onChange={(e) => setDomain(e.target.value)}
            style={{ width: "100%", padding: "0.6rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 6, fontSize: "1rem", lineHeight: 1.5, letterSpacing: "0.02em" }} />
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: 6, color: "#1a1a2e", letterSpacing: "0.02em" }}>Context (JSON)</label>
          <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={6}
            style={{ width: "100%", padding: "0.6rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 6, fontSize: "0.9375rem", lineHeight: 1.65, fontFamily: "monospace", letterSpacing: "0.02em", resize: "vertical" }} />
        </div>
        <button onClick={handleEvaluate} disabled={loading}
          style={{ background: "#1a1a2e", color: "#fff", border: "none", padding: "0.75rem 1.5rem", borderRadius: 6, cursor: "pointer", fontSize: "1rem", fontWeight: 600, letterSpacing: "0.02em" }}>
          {loading ? "Evaluating…" : "Evaluate"}
        </button>
        {error && <div style={{ marginTop: "1rem", color: "#dc2626", fontSize: "1rem", lineHeight: 1.5, letterSpacing: "0.02em" }}><span aria-hidden="true">✗ </span>{error}</div>}
        {result && (
          <div style={{ marginTop: "1.5rem", padding: "1.25rem", background: "#f8f9fa", borderRadius: 6, fontSize: "1rem", lineHeight: 1.65, letterSpacing: "0.02em", color: "#444444" }}>
            <div style={{ marginBottom: "0.5rem" }}><strong style={{ color: "#1a1a2e" }}>Decision ID:</strong> {result.decisionId}</div>
            <div style={{ marginBottom: "0.5rem" }}><strong style={{ color: "#1a1a2e" }}>Domain:</strong> {result.domain}</div>
            <div style={{ marginBottom: "0.5rem" }}><strong style={{ color: "#1a1a2e" }}>Decision:</strong> {result.decision}</div>
            <div><strong style={{ color: "#1a1a2e" }}>Status:</strong> {result.status}</div>
          </div>
        )}
      </div>
    </div>
  );
}