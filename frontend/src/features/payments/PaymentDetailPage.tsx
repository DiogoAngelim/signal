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
    // Extract tenantId from captureId pattern: capture_{tenantId}_{authId}
    const tenantId = captureId.includes("_") ? captureId.split("_")[1] : "unknown";
    getPaymentCapture({ tenantId, captureId }).then((r) => { if (r.ok) setResult(r.result); }).finally(() => setLoading(false));
  }, [captureId]);

  if (loading) return <div style={{ color: "#666" }}>Loading payment…</div>;
  if (!result?.found) return <div style={{ color: "#999" }}>Payment not found: {captureId}</div>;

  const capture = result.capture;
  return (
    <div>
      <h1 style={{ margin: "0 0 1.5rem", fontSize: "1.5rem" }}>Payment Detail</h1>
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", maxWidth: 600 }}>
        {capture ? (
          <div style={{ fontSize: "0.9rem", color: "#444" }}>
            <div style={{ marginBottom: 8 }}><strong>Capture ID:</strong> {capture.captureId}</div>
            <div style={{ marginBottom: 8 }}><strong>Tenant:</strong> {capture.tenantId}</div>
            <div style={{ marginBottom: 8 }}><strong>Authorization:</strong> {capture.authorizationId}</div>
            <div style={{ marginBottom: 8 }}><strong>Amount:</strong> {(capture.amountCents / 100).toFixed(2)} {capture.currency}</div>
            <div style={{ marginBottom: 8 }}><strong>Status:</strong> <span style={{ color: capture.status === "captured" ? "#16a34a" : "#dc2626" }}>{capture.status}</span></div>
            <div style={{ marginBottom: 8 }}><strong>Captured At:</strong> {capture.capturedAt}</div>
            <div style={{ marginBottom: 8 }}><strong>Risk:</strong> {capture.risk.declared ? `Declared (${capture.risk.classification})` : "Not declared"}</div>
            <div style={{ marginBottom: 8 }}><strong>Audit ID:</strong> {capture.auditId}</div>
            <div><strong>Outbox ID:</strong> {capture.outboxId}</div>
          </div>
        ) : <div>No capture data</div>}
      </div>
    </div>
  );
}