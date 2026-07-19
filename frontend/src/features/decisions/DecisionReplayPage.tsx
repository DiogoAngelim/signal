import { useParams } from "react-router-dom";
import { useState } from "react";
import { signalQuery } from "../../api/client";

interface ReplayResult {
  decisionId: string;
  replayed: boolean;
  originalDecision: string;
  replayedDecision: string;
  diverged: boolean;
  replayedAt: string;
}

export function DecisionReplayPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReplay() {
    if (!id) return;
    setLoading(true);
    setError(null);
    const r = await signalQuery<ReplayResult>("decision.replay.v1", { decisionId: id });
    if (r.ok) setResult(r.result);
    else setError(r.error.message);
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: "65ch" }}>
      <h1 style={{ margin: "0 0 2rem", fontSize: "2.25rem", fontWeight: 700, lineHeight: 1.25, letterSpacing: "0.04em", color: "#1a1a2e" }}>Replay Decision</h1>
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <p style={{ color: "#595959", fontSize: "1rem", lineHeight: 1.65, letterSpacing: "0.02em", margin: "0 0 1.5rem" }}>
          Replay decision <code style={{ background: "#f0f1f3", padding: "0.15rem 0.4rem", borderRadius: 4, fontSize: "0.9375rem" }}>{id}</code> to verify deterministic execution.
        </p>
        <button onClick={handleReplay} disabled={loading}
          style={{ background: "#1a1a2e", color: "#fff", border: "none", padding: "0.75rem 1.5rem", borderRadius: 6, cursor: "pointer", fontSize: "1rem", fontWeight: 600, letterSpacing: "0.02em" }}>
          {loading ? "Replaying…" : "Replay Decision"}
        </button>
        {error && <div style={{ marginTop: "1rem", color: "#dc2626", fontSize: "1rem", lineHeight: 1.5, letterSpacing: "0.02em" }}><span aria-hidden="true">✗ </span>{error}</div>}
        {result && (
          <div style={{ marginTop: "1.5rem", padding: "1.25rem", background: "#f8f9fa", borderRadius: 6, fontSize: "1rem", lineHeight: 1.65, letterSpacing: "0.02em", color: "#444444" }}>
            <div style={{ marginBottom: "0.5rem" }}><strong style={{ color: "#1a1a2e" }}>Replayed:</strong> <span style={{ color: result.replayed ? "#16a34a" : "#dc2626", fontWeight: 600 }}><span aria-hidden="true">{result.replayed ? "✓" : "✗"}</span> {String(result.replayed)}</span></div>
            <div style={{ marginBottom: "0.5rem" }}><strong style={{ color: "#1a1a2e" }}>Original:</strong> {result.originalDecision}</div>
            <div style={{ marginBottom: "0.5rem" }}><strong style={{ color: "#1a1a2e" }}>Replayed:</strong> {result.replayedDecision}</div>
            <div style={{ marginBottom: "0.5rem" }}><strong style={{ color: "#1a1a2e" }}>Diverged:</strong> <span style={{ color: result.diverged ? "#dc2626" : "#16a34a", fontWeight: 600 }}><span aria-hidden="true">{result.diverged ? "✗" : "✓"}</span> {String(result.diverged)}</span></div>
            <div><strong style={{ color: "#1a1a2e" }}>At:</strong> {result.replayedAt}</div>
          </div>
        )}
      </div>
    </div>
  );
}