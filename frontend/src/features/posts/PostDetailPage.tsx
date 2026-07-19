import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { getPost } from "../../api/client";
import type { PostGetResult } from "../../../../contracts/domain-types";

export function PostDetailPage() {
  const { postId } = useParams<{ postId: string }>();
  const [result, setResult] = useState<PostGetResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!postId) return;
    setLoading(true);
    getPost({ postId }).then((r) => { if (r.ok) setResult(r.result); }).finally(() => setLoading(false));
  }, [postId]);

  if (loading) return <div style={{ color: "#595959", fontSize: "1rem", lineHeight: 1.5 }}>Loading post…</div>;
  if (!result?.found) return <div style={{ color: "#6b6b6b", fontSize: "1rem", lineHeight: 1.5 }}>Post not found: {postId}</div>;

  return (
    <div style={{ maxWidth: "65ch" }}>
      <h1 style={{ margin: "0 0 2rem", fontSize: "2.25rem", fontWeight: 700, lineHeight: 1.25, letterSpacing: "0.04em", color: "#1a1a2e" }}>Post Detail</h1>
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1.5rem", fontWeight: 600, lineHeight: 1.25, letterSpacing: "0.04em", color: "#1a1a2e" }}>{result.post?.title}</h2>
        <p style={{ color: "#444444", fontSize: "1rem", lineHeight: 1.65, letterSpacing: "0.02em", margin: "0 0 1.5rem", maxWidth: "65ch" }}>{result.post?.body || "(no content)"}</p>
        <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#595959", lineHeight: 1.5, letterSpacing: "0.02em" }}>
          ID: {result.post?.postId} · Published: {result.post?.publishedAt}
        </div>
      </div>
    </div>
  );
}