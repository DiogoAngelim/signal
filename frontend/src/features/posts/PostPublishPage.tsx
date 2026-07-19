import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { publishPost } from "../../api/client";

export function PostPublishPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = await publishPost({ title, body });
    if (r.ok && r.result.post?.postId) {
      navigate(`/posts/${r.result.post.postId}`);
    }
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: "65ch" }}>
      <h1 style={{ margin: "0 0 2rem", fontSize: "2.25rem", fontWeight: 700, lineHeight: 1.25, letterSpacing: "0.04em", color: "#1a1a2e" }}>Publish Post</h1>
      <form onSubmit={handleSubmit} style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: 6, color: "#1a1a2e", letterSpacing: "0.02em" }}>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required
            style={{ width: "100%", padding: "0.6rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 6, fontSize: "1rem", lineHeight: 1.5, letterSpacing: "0.02em" }} />
        </div>
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: 6, color: "#1a1a2e", letterSpacing: "0.02em" }}>Body</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5}
            style={{ width: "100%", padding: "0.6rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 6, fontSize: "1rem", lineHeight: 1.65, letterSpacing: "0.02em", resize: "vertical" }} />
        </div>
        <button type="submit" disabled={loading}
          style={{ background: "#1a1a2e", color: "#fff", border: "none", padding: "0.75rem 1.5rem", borderRadius: 6, cursor: "pointer", fontSize: "1rem", fontWeight: 600, letterSpacing: "0.02em" }}>
          {loading ? "Publishing…" : "Publish"}
        </button>
      </form>
    </div>
  );
}