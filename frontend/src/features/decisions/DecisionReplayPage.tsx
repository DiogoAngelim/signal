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
    <div>
      <h1 style={{ margin: "0 0 1.5rem", fontSize: "1.5rem" }}>Replay Decision</h1>
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", maxWidth: 600 }}>
        <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: 16 }}>
          Replay decision <code>{id}</code> to verify deterministic execution.
        </p>
        <button onClick={handleReplay} disabled={loading}
          style={{ background: "#1a1a2e", color: "#fff", border: "none", padding: "0.6rem 1.5rem", borderRadius: 6, cursor: "pointer", fontSize: "0.875rem" }}>
          {loading ? "Replaying…" : "Replay Decision"}
        </button>
        {error && <div style={{ marginTop: 12, color: "#dc2626", fontSize: "0.85rem" }}>{error}</div>}
        {result && (
          <div style={{ marginTop: 16, padding: "1rem", background: "#f9f9f9", borderRadius: 6, fontSize: "0.85rem" }}>
            <div style={{ marginBottom: 4 }}><strong>Replayed:</strong> <span style={{ color: result.replayed ? "#16a34a" : "#dc2626" }}>{String(result.replayed)}</span></div>
            <div style={{ marginBottom: 4 }}><strong>Original:</strong> {result.originalDecision}</div>
            <div style={{ marginBottom: 4 }}><strong>Replayed:</strong> {result.replayedDecision}</div>
            <div style={{ marginBottom: 4 }}><strong>Diverged:</strong> <span style={{ color: result.diverged ? "#dc2626" : "#16a34a" }}>{String(result.diverged)}</span></div>
            <div><strong>At:</strong> {result.replayedAt}</div>
          </div>
        )}
      </div>
    </div>
  );
}