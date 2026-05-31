import useBaseUrl from "@docusaurus/useBaseUrl";
import type { ReactElement } from "react";

const checkpoints = [
  {
    title: "Contract",
    text: "The envelope carries the protocol version, kind, operation name, payload, context, delivery metadata, auth, and optional meta.",
  },
  {
    title: "Execution",
    text: "The runtime looks up a registered query, mutation, event, or decision operation and runs the matching handler through the same result contract.",
  },
  {
    title: "Evidence",
    text: "Trace context, idempotency metadata, replay state, outcomes, and decision memory make behavior reconstructable after the fact.",
  },
];

export default function SignalArchitectureDiagram(): ReactElement {
  const diagramUrl = useBaseUrl("/img/signal-architecture.svg");

  return (
    <figure className="signal-architecture-diagram">
      <a href={diagramUrl} aria-label="Open the Signal architecture SVG">
        <img
          src={diagramUrl}
          alt="Signal architecture from user to client, envelope, operation, runtime, handler, trace, result, and audit store."
          loading="lazy"
        />
      </a>
      <figcaption>
        Signal keeps the public protocol, runtime execution, transport bindings,
        and downstream domain decisions separate. Stocks-Optimizer integrates as
        a downstream implementation that feeds market evidence into Signal
        decisions and exposes API, stream, webhook, and audit surfaces.
      </figcaption>
      <div
        className="signal-architecture-checkpoints"
        aria-label="Architecture checkpoints"
      >
        {checkpoints.map((checkpoint) => (
          <section key={checkpoint.title}>
            <h3>{checkpoint.title}</h3>
            <p>{checkpoint.text}</p>
          </section>
        ))}
      </div>
    </figure>
  );
}
