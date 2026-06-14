import { useCapabilities } from "../../hooks";
import { getCertification } from "../../api/client";
import { useState, useEffect } from "react";
import type { ReferenceCertificationResult } from "../../../../contracts/domain-types";

export function DashboardPage() {
  const { result: capsResult, loading: capsLoading } = useCapabilities();
  const [cert, setCert] = useState<ReferenceCertificationResult | null>(null);

  useEffect(() => {
    getCertification().then((r) => { if (r.ok) setCert(r.result); });
  }, []);

  if (capsLoading) return <div style={{ color: "#666" }}>Loading capabilities…</div>;

  const caps = capsResult?.ok ? capsResult.result : null;

  return (
    <div>
      <h1 style={{ margin: "0 0 1.5rem", fontSize: "1.5rem" }}>Signal Protocol Dashboard</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
        <div style={{ background: "#fff", borderRadius: 8, padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h3 style={{ margin: "0 0 0.75rem", color: "#1a1a2e" }}>Capabilities</h3>
          {caps ? (
            <div style={{ fontSize: "0.875rem", color: "#444" }}>
              <div>Queries: <strong>{caps.queries.length}</strong></div>
              <div>Mutations: <strong>{caps.mutations.length}</strong></div>
              <div>Published Events: <strong>{caps.publishedEvents.length}</strong></div>
              <div>Subscribed Events: <strong>{caps.subscribedEvents.length}</strong></div>
              <div style={{ marginTop: 8 }}>Protocol: <code>{caps.protocol}</code></div>
            </div>
          ) : <div style={{ color: "#999" }}>Unavailable</div>}
        </div>

        <div style={{ background: "#fff", borderRadius: 8, padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h3 style={{ margin: "0 0 0.75rem", color: "#1a1a2e" }}>Features</h3>
          {caps?.features ? (
            <div style={{ fontSize: "0.875rem", color: "#444" }}>
              {Object.entries(caps.features).map(([key, val]) => (
                <div key={key}>{key}: <span style={{ color: val ? "#16a34a" : "#dc2626" }}>{String(val)}</span></div>
              ))}
            </div>
          ) : <div style={{ color: "#999" }}>Unavailable</div>}
        </div>

        <div style={{ background: "#fff", borderRadius: 8, padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h3 style={{ margin: "0 0 0.75rem", color: "#1a1a2e" }}>Certification</h3>
          {cert ? (
            <div style={{ fontSize: "0.875rem" }}>
              <div style={{ color: cert.passed ? "#16a34a" : "#dc2626", fontWeight: 600, marginBottom: 8 }}>
                {cert.passed ? "✓ PASSED" : "✗ FAILED"}
              </div>
              {cert.checks.map((check, i) => (
                <div key={i} style={{ marginBottom: 4, color: "#444" }}>
                  <span style={{ color: check.passed ? "#16a34a" : "#dc2626" }}>{check.passed ? "✓" : "✗"}</span>
                  {" "}{check.name}
                </div>
              ))}
            </div>
          ) : <div style={{ color: "#999" }}>Loading…</div>}
        </div>
      </div>
    </div>
  );
}