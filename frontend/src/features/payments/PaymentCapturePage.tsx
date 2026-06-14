import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { capturePayment } from "../../api/client";

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
    <div>
      <h1 style={{ margin: "0 0 1.5rem", fontSize: "1.5rem" }}>Capture Payment</h1>
      <form onSubmit={handleSubmit} style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", maxWidth: 600 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Tenant ID</label>
          <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} required
            style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #ddd", borderRadius: 6, fontSize: "0.9rem" }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Authorization ID</label>
          <input value={authorizationId} onChange={(e) => setAuthorizationId(e.target.value)} required
            style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #ddd", borderRadius: 6, fontSize: "0.9rem" }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Amount (cents)</label>
          <input type="number" value={amountCents} onChange={(e) => setAmountCents(Number(e.target.value))} required
            style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #ddd", borderRadius: 6, fontSize: "0.9rem" }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Currency</label>
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} required
            style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #ddd", borderRadius: 6, fontSize: "0.9rem" }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Risk Classification</label>
          <select value={riskClassification} onChange={(e) => setRiskClassification(e.target.value as "high" | "critical")}
            style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #ddd", borderRadius: 6, fontSize: "0.9rem" }}>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Risk Reason</label>
          <input value={riskReason} onChange={(e) => setRiskReason(e.target.value)} required
            style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #ddd", borderRadius: 6, fontSize: "0.9rem" }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Approved By</label>
          <input value={riskApprovedBy} onChange={(e) => setRiskApprovedBy(e.target.value)} required
            style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #ddd", borderRadius: 6, fontSize: "0.9rem" }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Payment Token</label>
          <input value={paymentToken} onChange={(e) => setPaymentToken(e.target.value)} required
            style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #ddd", borderRadius: 6, fontSize: "0.9rem" }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Last 4 Digits</label>
          <input value={paymentLast4} onChange={(e) => setPaymentLast4(e.target.value)} required maxLength={4}
            style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #ddd", borderRadius: 6, fontSize: "0.9rem" }} />
        </div>
        <button type="submit" disabled={loading}
          style={{ background: "#1a1a2e", color: "#fff", border: "none", padding: "0.6rem 1.5rem", borderRadius: 6, cursor: "pointer", fontSize: "0.875rem" }}>
          {loading ? "Capturing…" : "Capture Payment"}
        </button>
      </form>
    </div>
  );
}