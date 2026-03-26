import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";

export default function Home(): JSX.Element {
  return (
    <Layout
      title="Signal"
      description="A transport-agnostic application protocol for queries, mutations, and events."
    >
      <main className="hero hero--signal">
        <div className="container margin-vert--xl">
          <div className="signal-home-copy">
            <h1>Signal is a transport-agnostic application protocol.</h1>
            <p>
              It defines versioned queries, mutations, and events with a standard
              envelope, idempotency rules, capability declaration, and HTTP and
              in-process bindings.
            </p>
            <div className="margin-top--lg">
              <Link className="button button--primary margin-right--md" to="/docs/introduction">
                Read the docs
              </Link>
              <Link className="button button--secondary" to="/docs/reference/envelope">
                View the envelope
              </Link>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
