import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";

export default function Home(): JSX.Element {
  return (
    <Layout
      title="Signal Protocol v1"
      description="A transport-independent application protocol and Node.js reference runtime for versioned queries, mutations, and events."
    >
      <main className="hero hero--signal">
        <div className="container margin-vert--xl">
          <div className="signal-home-copy">
            <h1>Signal Protocol v1</h1>
            <p>
              Signal defines how application messages are structured, versioned,
              executed, replayed, and exposed across bindings without becoming
              coupled to HTTP, brokers, or a business domain.
            </p>
            <ul>
              <li>Public RFCs describe the contract before the code exists.</li>
              <li>Operations use explicit names such as `post.publish.v1`.</li>
              <li>Mutations declare idempotency behavior explicitly.</li>
              <li>Successful replays surface logical replay metadata.</li>
              <li>Capability documents show exactly what a runtime supports.</li>
            </ul>
            <div className="margin-top--lg">
              <Link className="button button--primary margin-right--md" to="/docs/introduction">
                Read the introduction
              </Link>
              <Link className="button button--secondary" to="/docs/reference/envelope">
                View the envelope
              </Link>
            </div>
            <p className="margin-top--md">
              Start with <Link to="/docs/guides/quickstart">Quickstart</Link>,
              then read the envelope and compare the reference runtime with your
              own implementation.
            </p>
          </div>
        </div>
      </main>
    </Layout>
  );
}
