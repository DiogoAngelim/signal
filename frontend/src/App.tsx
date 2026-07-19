import { Routes, Route, NavLink } from "react-router-dom";
import { setAdapter } from "./api/client";
import { mockAdapter } from "./api/mocks";
import { useLanguage } from "./hooks/useLanguage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { NoteDetailPage } from "./features/notes/NoteDetailPage";
import { PostDetailPage } from "./features/posts/PostDetailPage";
import { PostPublishPage } from "./features/posts/PostPublishPage";
import { PaymentCapturePage } from "./features/payments/PaymentCapturePage";
import { PaymentDetailPage } from "./features/payments/PaymentDetailPage";
import { DecisionsPage } from "./features/decisions/DecisionsPage";
import { DecisionDetailPage } from "./features/decisions/DecisionDetailPage";
import { DecisionEvaluatePage } from "./features/decisions/DecisionEvaluatePage";
import { DecisionReplayPage } from "./features/decisions/DecisionReplayPage";
import { CommitmentEvaluatePage } from "./features/commitment/CommitmentEvaluatePage";

// Initialize the mock adapter — swap with HttpSignalAdapter for real backend
setAdapter(mockAdapter);

const navItems = [
  { label: "Dashboard", path: "/" },
  { label: "Notes", path: "/notes/note_1001" },
  { label: "Posts", path: "/posts/post_1001" },
  { label: "New Post", path: "/posts/new" },
  { label: "Capture Payment", path: "/payments/capture" },
  { label: "Decisions", path: "/decisions" },
  { label: "Evaluate Decision", path: "/decisions/evaluate" },
  { label: "Commitment", path: "/commitment/evaluate" },
];

export default function App() {
  const { language, setLanguage } = useLanguage();

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Inter', 'Lexend', system-ui, -apple-system, sans-serif", lineHeight: 1.5, letterSpacing: "0.02em" }}>
      <nav style={{
        width: 240,
        background: "#1a1a2e",
        color: "#e0e0e0",
        padding: "1.5rem 1rem",
        flexShrink: 0,
      }}>
        <h2 style={{ margin: "0 0 1.5rem 0", fontSize: "1.25rem", fontWeight: 700, lineHeight: 1.25, letterSpacing: "0.04em", color: "#00d4ff" }}>⚡ Signal</h2>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            style={({ isActive }) => ({
              display: "block",
              padding: "0.5rem 0.75rem",
              marginBottom: 2,
              borderRadius: 6,
              color: isActive ? "#00d4ff" : "#b0b0b0",
              background: isActive ? "rgba(0,212,255,0.1)" : "transparent",
              textDecoration: "none",
              fontSize: "0.875rem",
            })}
          >
            {item.label}
          </NavLink>
        ))}
        <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <label htmlFor="language-select" style={{ display: "block", fontSize: "0.875rem", color: "#b0b0b0", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Language</label>
          <select
            id="language-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{
              width: "100%",
              padding: "0.4rem 0.5rem",
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "#12122a",
              color: "#e0e0e0",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            <option value="en">English</option>
            <option value="pt">Português</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
          </select>
        </div>
      </nav>
      <main style={{ flex: 1, padding: "2.5rem 2rem 2rem 2.5rem", background: "#f5f5f5", overflowY: "auto", maxWidth: "960px" }}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/notes/:noteId" element={<NoteDetailPage />} />
          <Route path="/posts/:postId" element={<PostDetailPage />} />
          <Route path="/posts/new" element={<PostPublishPage />} />
          <Route path="/payments/capture" element={<PaymentCapturePage />} />
          <Route path="/payments/:captureId" element={<PaymentDetailPage />} />
          <Route path="/decisions" element={<DecisionsPage />} />
          <Route path="/decisions/evaluate" element={<DecisionEvaluatePage />} />
          <Route path="/decisions/:id" element={<DecisionDetailPage />} />
          <Route path="/decisions/:id/replay" element={<DecisionReplayPage />} />
          <Route path="/commitment/evaluate" element={<CommitmentEvaluatePage />} />
        </Routes>
      </main>
    </div>
  );
}