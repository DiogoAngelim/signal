import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { getNote } from "../../api/client";
import type { NoteGetResult } from "../../../../contracts/domain-types";

export function NoteDetailPage() {
  const { noteId } = useParams<{ noteId: string }>();
  const [result, setResult] = useState<NoteGetResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!noteId) return;
    setLoading(true);
    getNote({ noteId }).then((r) => { if (r.ok) setResult(r.result); }).finally(() => setLoading(false));
  }, [noteId]);

  if (loading) return <div style={{ color: "#595959", fontSize: "1rem", lineHeight: 1.5 }}>Loading note…</div>;
  if (!result?.found) return <div style={{ color: "#6b6b6b", fontSize: "1rem", lineHeight: 1.5 }}>Note not found: {noteId}</div>;

  return (
    <div style={{ maxWidth: "65ch" }}>
      <h1 style={{ margin: "0 0 2rem", fontSize: "2.25rem", fontWeight: 700, lineHeight: 1.25, letterSpacing: "0.04em", color: "#1a1a2e" }}>Note Detail</h1>
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1.5rem", fontWeight: 600, lineHeight: 1.25, letterSpacing: "0.04em", color: "#1a1a2e" }}>{result.note?.title}</h2>
        <p style={{ color: "#444444", fontSize: "1rem", lineHeight: 1.65, letterSpacing: "0.02em", margin: "0 0 1.5rem", maxWidth: "65ch" }}>{result.note?.body}</p>
        <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#595959", lineHeight: 1.5, letterSpacing: "0.02em" }}>
          ID: {result.note?.noteId} · Updated: {result.note?.updatedAt}
        </div>
      </div>
    </div>
  );
}