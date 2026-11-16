import { useState, type FormEvent } from "react";
import { LockKeyhole, X } from "lucide-react";
import { luminaApi, type Capabilities, type LuminaUser } from "@/lib/lumina-api";

type Props = {
  capabilities: Capabilities | null;
  onClose: () => void;
  onAuthenticated: (user: LuminaUser) => void;
};

export default function LuminaAccountPanel({ capabilities, onClose, onAuthenticated }: Props) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const available = capabilities?.auth === true;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!available || working) return;
    setWorking(true);
    setMessage("");
    try {
      if (mode === "sign-up") {
        await luminaApi.signUp(name.trim(), email.trim().toLowerCase(), password);
        const signedIn = await luminaApi.me().catch(() => null);
        if (!signedIn?.user) {
          setMessage("Account created. Check your email for the verification link, then sign in.");
          setMode("sign-in");
          setPassword("");
          return;
        }
        onAuthenticated(signedIn.user);
      } else {
        await luminaApi.signIn(email.trim().toLowerCase(), password);
        const session = await luminaApi.me();
        onAuthenticated(session.user);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your account couldn't be opened.");
    } finally { setWorking(false); }
  }

  return (
    <div className="l-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="lumina-auth-title" className="l-panel l-auth-panel"
        onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
        <div className="l-panel-header">
          <h2 id="lumina-auth-title">{mode === "sign-in" ? "Welcome back." : "Make room for your ideas."}</h2>
          <button className="l-close" onClick={onClose} aria-label="Close account panel" type="button"><X size={18} /></button>
        </div>
        <p>Explore freely without an account. Sign in only when you'd like your goals, Practice, and conversations to stay with you across devices.</p>
        {!available ? (
          <div className="l-status" role="status"><LockKeyhole size={17} /><span>Account services aren't configured yet. Practice remains available without signing in.</span></div>
        ) : (
          <form className="l-auth-form" onSubmit={submit}>
            {mode === "sign-up" ? (
              <label>Your name
                <input autoComplete="name" required maxLength={80} value={name}
                  onChange={(event) => setName(event.target.value)} placeholder="What should we call you?" />
              </label>
            ) : null}
            <label>Email
              <input type="email" autoComplete="email" required value={email} maxLength={254}
                onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </label>
            <label>Password
              <input type="password" required minLength={mode === "sign-up" ? 12 : undefined}
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                value={password} onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === "sign-up" ? "At least 12 characters" : "Your password"} />
            </label>
            {message ? <p className="l-auth-message" role="status">{message}</p> : null}
            <button className="l-primary" type="submit" disabled={working || (mode === "sign-up" && !capabilities?.registrationReady)}>
              {working ? "Checking…" : mode === "sign-in" ? "Sign in" : "Create account"}
            </button>
            {mode === "sign-up" && !capabilities?.registrationReady ? <p>Email verification needs to be configured before new accounts can be created.</p> : null}
          </form>
        )}
        <div className="l-auth-switch">
          {mode === "sign-in" ? "New to Lúmina?" : "Already have an account?"}
          <button type="button" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setMessage(""); }}>
            {mode === "sign-in" ? "Create an account" : "Sign in instead"}
          </button>
        </div>
        <p className="l-auth-foot">We never ask for brokerage passwords or trading API keys.</p>
      </section>
    </div>
  );
}
