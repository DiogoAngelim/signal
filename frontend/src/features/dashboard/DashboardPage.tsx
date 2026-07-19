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

  if (capsLoading) return <div style={{ color: "#595959", fontSize: "1rem", lineHeight: 1.5 }}>Loading capabilities…</div>;

  const caps = capsResult?.ok ? capsResult.result : null;

  return (
    <div style={{ maxWidth: "75ch" }}>
      <h1 style={{ margin: "0 0 2rem", fontSize: "2.25rem", fontWeight: 700, lineHeight: 1.25, letterSpacing: "0.04em", color: "#1a1a2e" }}>Signal Protocol Dashboard</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "2rem" }}>
        <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h3 style={{ margin: "0 0 1rem", fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.3, letterSpacing: "0.02em", color: "#1a1a2e" }}>Capabilities</h3>
          {caps ? (
            <div style={{ fontSize: "1rem", lineHeight: 1.65, letterSpacing: "0.02em", color: "#444444" }}>
              <div style={{ marginBottom: "0.5rem" }}>Queries: <strong>{caps.queries.length}</strong></div>
              <div style={{ marginBottom: "0.5rem" }}>Mutations: <strong>{caps.mutations.length}</strong></div>
              <div style={{ marginBottom: "0.5rem" }}>Published Events: <strong>{caps.publishedEvents.length}</strong></div>
              <div style={{ marginBottom: "0.5rem" }}>Subscribed Events: <strong>{caps.subscribedEvents.length}</strong></div>
              <div style={{ marginTop: "0.75rem" }}>Protocol: <code style={{ background: "#f0f1f3", padding: "0.15rem 0.4rem", borderRadius: 4, fontSize: "0.9375rem" }}>{caps.protocol}</code></div>
            </div>
          ) : <div style={{ color: "#6b6b6b", fontSize: "1rem" }}>Unavailable</div>}
        </div>

        <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h3 style={{ margin: "0 0 1rem", fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.3, letterSpacing: "0.02em", color: "#1a1a2e" }}>Features</h3>
          {caps?.features ? (
            <div style={{ fontSize: "1rem", lineHeight: 1.65, letterSpacing: "0.02em", color: "#444444" }}>
              {Object.entries(caps.features).map(([key, val]) => (
                <div key={key} style={{ marginBottom: "0.5rem" }}>{key}: <span style={{ color: val ? "#16a34a" : "#dc2626", fontWeight: 600 }}><span aria-hidden="true">{val ? "✓ " : "✗ "}</span>{String(val)}</span></div>
              ))}
            </div>
          ) : <div style={{ color: "#6b6b6b", fontSize: "1rem" }}>Unavailable</div>}
        </div>

        <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h3 style={{ margin: "0 0 1rem", fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.3, letterSpacing: "0.02em", color: "#1a1a2e" }}>Certification</h3>
          {cert ? (
            <div style={{ fontSize: "1rem", lineHeight: 1.65, letterSpacing: "0.02em" }}>
              <div style={{ color: cert.passed ? "#16a34a" : "#dc2626", fontWeight: 700, marginBottom: "0.75rem", fontSize: "1.125rem", letterSpacing: "0.02em" }}>
                <span aria-hidden="true">{cert.passed ? "✓ " : "✗ "}</span>{cert.passed ? "PASSED" : "FAILED"}
              </div>
              {cert.checks.map((check, i) => (
                <div key={i} style={{ marginBottom: "0.5rem", color: "#444444" }}>
                  <span style={{ color: check.passed ? "#16a34a" : "#dc2626", fontWeight: 600 }}><span aria-hidden="true">{check.passed ? "✓" : "✗"}</span></span>
                  {" "}{check.name}
                </div>
              ))}
            </div>
          ) : <div style={{ color: "#6b6b6b", fontSize: "1rem" }}>Loading…</div>}
        </div>
      </div>
    </div>
  );
}