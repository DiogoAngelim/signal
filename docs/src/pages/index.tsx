import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import type { ReactElement } from "react";

export default function Home(): ReactElement {
  return (
    <Layout
      title="Signal"
      description="Signal helps teams understand operational workflows through clear queries, mutations, events, and evidence."
    >
      <main className="hero hero--signal">
        <div className="container margin-vert--xl">
          <div className="signal-home-copy">
            <p className="signal-eyebrow">Signal</p>
            <h1>Current understanding</h1>
            <p className="signal-home-lede">
              Signal helps teams understand what is happening across a workflow
              before they ask the system to act again. Reads stay separate from
              changes, changes can be retried without confusion, and facts
              remain visible after the moment passes.
            </p>
            <p>
              Start with one small operational flow, inspect the returned
              result, then reveal the protocol details only when they help the
              situation become clearer.
            </p>
            <div className="margin-top--lg">
              <Link
                className="button button--primary margin-right--md"
                to="/docs/what-is-signal"
              >
                Start here
              </Link>
              <Link
                className="button button--secondary"
                to="/docs/start/quick-start"
              >
                Quick Start
              </Link>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
