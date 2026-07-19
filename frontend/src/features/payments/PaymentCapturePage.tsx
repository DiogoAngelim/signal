import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { capturePayment } from "../../api/client";

const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: 6, color: "#1a1a2e", letterSpacing: "0.02em" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "0.6rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 6, fontSize: "1rem", lineHeight: 1.5, letterSpacing: "0.02em" };

export function PaymentCapturePage() {
  const navigate = useNavigate();
  const [tenantId, setTenantId] = useState("tenant_001");
  const [authorizationId, setAuthorizationId] = useState("auth_001");
  const [amountCents, setAmountCents] = useState(10000);
  const [currency, setCurrency] = useState("USD");
  const [riskClassification, setRiskClassification] = useState<"high" | "critical">("high");
  const [riskReason, setRiskReason] = useState("High-value transaction");
  const [riskApprovedBy, setRiskApprovedBy] = useState("admin_001");
  const [paymentToken, setPaymentToken] = useState("tok_visa_4242");
  const [paymentLast4, setPaymentLast4] = useState("4242");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const idempotencyKey = `capture_${tenantId}_${Date.now()}`;
    const r = await capturePayment(
      {
        tenantId,
        authorizationId,
        amountCents,
        currency,
        paymentMethod: { token: paymentToken, last4: paymentLast4 },
        risk: { declared: true, classification: riskClassification, reason: riskReason, approvedBy: riskApprovedBy },
      },
      idempotencyKey,
    );
    if (r.ok && r.result.captureId) {
      navigate(`/payments/${r.result.captureId}`);
    }
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: "65ch" }}>
      <h1 style={{ margin: "0 0 2rem", fontSize: "2.25rem", fontWeight: 700, lineHeight: 1.25, letterSpacing: "0.04em", color: "#1a1a2e" }}>Capture Payment</h1>
      <form onSubmit={handleSubmit} style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle}>Tenant ID</label>
          <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} required style={inputStyle} />
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle}>Authorization ID</label>
          <input value={authorizationId} onChange={(e) => setAuthorizationId(e.target.value)} required style={inputStyle} />
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle}>Amount (cents)</label>
          <input type="number" value={amountCents} onChange={(e) => setAmountCents(Number(e.target.value))} required style={inputStyle} />
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle}>Currency</label>
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} required style={inputStyle} />
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle}>Risk Classification</label>
          <select value={riskClassification} onChange={(e) => setRiskClassification(e.target.value as "high" | "critical")}
            style={inputStyle}>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle}>Risk Reason</label>
          <input value={riskReason} onChange={(e) => setRiskReason(e.target.value)} required style={inputStyle} />
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle}>Approved By</label>
          <input value={riskApprovedBy} onChange={(e) => setRiskApprovedBy(e.target.value)} required style={inputStyle} />
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle}>Payment Token</label>
          <input value={paymentToken} onChange={(e) => setPaymentToken(e.target.value)} required style={inputStyle} />
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={labelStyle}>Last 4 Digits</label>
          <input value={paymentLast4} onChange={(e) => setPaymentLast4(e.target.value)} required maxLength={4} style={inputStyle} />
        </div>
        <button type="submit" disabled={loading}
          style={{ background: "#1a1a2e", color: "#fff", border: "none", padding: "0.75rem 1.5rem", borderRadius: 6, cursor: "pointer", fontSize: "1rem", fontWeight: 600, letterSpacing: "0.02em" }}>
          {loading ? "Capturing…" : "Capture Payment"}
        </button>
      </form>
    </div>
  );
}