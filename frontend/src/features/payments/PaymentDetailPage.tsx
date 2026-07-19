import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { getPaymentCapture } from "../../api/client";
import type { PaymentCaptureGetResult } from "../../../../contracts/domain-types";

export function PaymentDetailPage() {
  const { captureId } = useParams<{ captureId: string }>();
  const [result, setResult] = useState<PaymentCaptureGetResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!captureId) return;
    setLoading(true);
    const tenantId = captureId.includes("_") ? captureId.split("_")[1] : "unknown";
    getPaymentCapture({ tenantId, captureId }).then((r) => { if (r.ok) setResult(r.result); }).finally(() => setLoading(false));
  }, [captureId]);

  if (loading) return <div style={{ color: "#595959", fontSize: "1rem", lineHeight: 1.5 }}>Loading payment…</div>;
  if (!result?.found) return <div style={{ color: "#6b6b6b", fontSize: "1rem", lineHeight: 1.5 }}>Payment not found: {captureId}</div>;

  const capture = result.capture;
  const isCaptured = capture?.status === "captured";
  return (
    <div style={{ maxWidth: "65ch" }}>
      <h1 style={{ margin: "0 0 2rem", fontSize: "2.25rem", fontWeight: 700, lineHeight: 1.25, letterSpacing: "0.04em", color: "#1a1a2e" }}>Payment Detail</h1>
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        {capture ? (
          <div style={{ fontSize: "1rem", lineHeight: 1.65, letterSpacing: "0.02em", color: "#444444" }}>
            <div style={{ marginBottom: "0.75rem" }}><strong style={{ color: "#1a1a2e" }}>Capture ID:</strong> {capture.captureId}</div>
            <div style={{ marginBottom: "0.75rem" }}><strong style={{ color: "#1a1a2e" }}>Tenant:</strong> {capture.tenantId}</div>
            <div style={{ marginBottom: "0.75rem" }}><strong style={{ color: "#1a1a2e" }}>Authorization:</strong> {capture.authorizationId}</div>
            <div style={{ marginBottom: "0.75rem" }}><strong style={{ color: "#1a1a2e" }}>Amount:</strong> {(capture.amountCents / 100).toFixed(2)} {capture.currency}</div>
            <div style={{ marginBottom: "0.75rem" }}><strong style={{ color: "#1a1a2e" }}>Status:</strong> <span style={{ color: isCaptured ? "#16a34a" : "#dc2626", fontWeight: 600 }}><span aria-hidden="true">{isCaptured ? "✓ " : "✗ "}</span>{capture.status}</span></div>
            <div style={{ marginBottom: "0.75rem" }}><strong style={{ color: "#1a1a2e" }}>Captured At:</strong> {capture.capturedAt}</div>
            <div style={{ marginBottom: "0.75rem" }}><strong style={{ color: "#1a1a2e" }}>Risk:</strong> {capture.risk.declared ? `Declared (${capture.risk.classification})` : "Not declared"}</div>
            <div style={{ marginBottom: "0.75rem" }}><strong style={{ color: "#1a1a2e" }}>Audit ID:</strong> {capture.auditId}</div>
            <div><strong style={{ color: "#1a1a2e" }}>Outbox ID:</strong> {capture.outboxId}</div>
          </div>
        ) : <div style={{ color: "#6b6b6b" }}>No capture data</div>}
      </div>
    </div>
  );
}