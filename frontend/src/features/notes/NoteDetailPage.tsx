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

  if (loading) return <div style={{ color: "#666" }}>Loading note…</div>;
  if (!result?.found) return <div style={{ color: "#999" }}>Note not found: {noteId}</div>;

  return (
    <div>
      <h1 style={{ margin: "0 0 1.5rem", fontSize: "1.5rem" }}>Note Detail</h1>
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.1rem" }}>{result.note?.title}</h2>
        <p style={{ color: "#444", fontSize: "0.9rem", lineHeight: 1.6 }}>{result.note?.body}</p>
        <div style={{ marginTop: 12, fontSize: "0.8rem", color: "#888" }}>
          ID: {result.note?.noteId} · Updated: {result.note?.updatedAt}
        </div>
      </div>
    </div>
  );
}