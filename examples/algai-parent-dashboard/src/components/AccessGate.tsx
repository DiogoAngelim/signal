import {
  BookOpenCheck,
  ExternalLink,
  GraduationCap,
  LogOut
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  clearParentHandoffToken,
  consumeParentHandoffTokenFromUrl,
  getAlgaiApiBaseUrl,
  resolveAlgaiAccess
} from "@/api/algaiParentAccess";
import type { AlgaiAccessResolution, AuthenticatedUser } from "@/api/types";
import { ParentDashboard } from "./ParentDashboard";

type GateState =
  | { kind: "checking" }
  | { kind: "ready"; user: AuthenticatedUser | null; access: AlgaiAccessResolution };

export function AccessGate() {
  const [state, setState] = useState<GateState>({ kind: "checking" });

  const refreshAccess = useCallback(async () => {
    setState({ kind: "checking" });
    consumeParentHandoffTokenFromUrl();
    const access = await resolveAlgaiAccess();
    const user = access.kind === "parent"
      ? {
          id: `parent-${access.email}`,
          email: access.email,
          name: access.email.split("@")[0] ?? access.email,
          provider: "google" as const
        }
      : null;
    setState({ kind: "ready", user, access });
  }, []);

  useEffect(() => {
    void refreshAccess();
  }, [refreshAccess]);

  useEffect(() => {
    if (state.kind !== "ready" || state.access.kind !== "unauthenticated") {
      return;
    }

    const { loginUrl } = state.access;
    const timer = window.setTimeout(() => {
      window.location.replace(loginUrl);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [state]);

  const handleSignOut = async () => {
    clearParentHandoffToken();
    await fetch(`${getAlgaiApiBaseUrl().replace(/\/$/u, "")}/public/session/logout`, {
      method: "POST",
      credentials: "include"
    }).catch(() => undefined);
    await refreshAccess();
  };

  if (state.kind === "checking") {
    return (
      <main className="access-shell">
        <section className="access-panel access-panel--compact" aria-busy="true">
          <img src="/logo.png" alt="AlgAI" className="access-mark access-mark--logo" />
          <div className="loading-line" />
          <p>Validating AlgAI parent access...</p>
        </section>
      </main>
    );
  }

  if (state.access.kind === "parent") {
    return (
      <ParentDashboard
        dashboards={state.access.dashboards}
        user={state.user}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <main className="access-shell">
      <section className="access-panel">
        <div className="access-visual">
          <img src="/logo.png" alt="AlgAI" className="access-mark access-mark--logo" />
          <div>
            <p className="eyebrow">AlgAI Parent Dashboard</p>
            <h1>{state.access.kind === "unauthenticated" ? "Open AlgAI to sign in" : "Access check"}</h1>
          </div>
        </div>

        {state.access.kind === "unauthenticated" ? (
          <>
            <p className="access-copy">
              Parent dashboards open from AlgAI after Google login confirms that your email is connected to a registered student. Sending you there now.
            </p>
            <a className="primary-button" href={state.access.loginUrl}>
              <ExternalLink aria-hidden="true" />
              Open AlgAI login
            </a>
          </>
        ) : null}

        {state.access.kind === "child" ? (
          <div className="access-message">
            <GraduationCap aria-hidden="true" />
            <div>
              <h2>Student access found</h2>
              <p>{state.access.message} Open AlgAI to continue in the student learning space.</p>
            </div>
          </div>
        ) : null}

        {state.access.kind === "denied" ? (
          <div className="access-message">
            <BookOpenCheck aria-hidden="true" />
            <div>
              <h2>We could not open this dashboard</h2>
              <p>{state.access.message}</p>
              <ul>
                {state.access.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {state.user ? (
          <button className="secondary-button" onClick={handleSignOut}>
            <LogOut aria-hidden="true" />
            Sign out
          </button>
        ) : null}
      </section>
    </main>
  );
}
