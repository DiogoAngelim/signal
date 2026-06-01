import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import type { ReactElement } from "react";

export default function Home(): ReactElement {
  return (
    <Layout
      title="Signal"
      description="Signal helps applications communicate through Queries, Mutations, and Events using a predictable protocol."
    >
      <main className="hero hero--signal">
        <div className="container margin-vert--xl">
          <div className="signal-home-copy">
            <p className="signal-eyebrow">Signal</p>
            <h1>Queries, Mutations, and Events</h1>
            <p>
              Signal gives your app one predictable way to ask for data, change
              data, and announce what happened.
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
