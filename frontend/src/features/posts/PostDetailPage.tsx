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

  if (loading) return <div style={{ color: "#666" }}>Loading post…</div>;
  if (!result?.found) return <div style={{ color: "#999" }}>Post not found: {postId}</div>;

  return (
    <div>
      <h1 style={{ margin: "0 0 1.5rem", fontSize: "1.5rem" }}>Post Detail</h1>
      <div style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.1rem" }}>{result.post?.title}</h2>
        <p style={{ color: "#444", fontSize: "0.9rem", lineHeight: 1.6 }}>{result.post?.body || "(no content)"}</p>
        <div style={{ marginTop: 12, fontSize: "0.8rem", color: "#888" }}>
          ID: {result.post?.postId} · Published: {result.post?.publishedAt}
        </div>
      </div>
    </div>
  );
}