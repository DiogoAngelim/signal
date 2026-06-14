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
    <div>
      <h1 style={{ margin: "0 0 1.5rem", fontSize: "1.5rem" }}>Publish Post</h1>
      <form onSubmit={handleSubmit} style={{ background: "#fff", borderRadius: 8, padding: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", maxWidth: 600 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required
            style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #ddd", borderRadius: 6, fontSize: "0.9rem" }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: 4, color: "#333" }}>Body</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5}
            style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #ddd", borderRadius: 6, fontSize: "0.9rem", resize: "vertical" }} />
        </div>
        <button type="submit" disabled={loading}
          style={{ background: "#1a1a2e", color: "#fff", border: "none", padding: "0.6rem 1.5rem", borderRadius: 6, cursor: "pointer", fontSize: "0.875rem" }}>
          {loading ? "Publishing…" : "Publish"}
        </button>
      </form>
    </div>
  );
}