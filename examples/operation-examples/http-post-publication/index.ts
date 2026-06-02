import { createSignalHttpServer } from "@signal/binding-http";
import { registerPostPublication } from "../post-publication";

export async function runHttpPostPublicationDemo() {
  const { runtime, state } = registerPostPublication();
  const app = createSignalHttpServer(runtime);

  const capabilities = await app.inject({
    method: "GET",
    url: "/signal/capabilities",
  });

  const query = await app.inject({
    method: "POST",
    url: "/signal/query/post.get.v1",
    payload: {
      payload: {
        postId: "post_1001",
      },
    },
  });

  const mutation = await app.inject({
    method: "POST",
    url: "/signal/mutation/post.publish.v1",
    payload: {
      payload: {
        postId: "post_1001",
        title: "Protocol first",
        body: "Signal keeps transport and execution concerns separate.",
      },
      idempotencyKey: "publish-post_1001-001",
      context: {
        correlationId: "corr-http-post-1001",
      },
    },
  });

  await app.close();

  return {
    capabilities: JSON.parse(capabilities.body),
    query: JSON.parse(query.body),
    mutation: JSON.parse(mutation.body),
    state,
  };
}

/* c8 ignore start */
if (require.main === module) {
  runHttpPostPublicationDemo().then((output) => {
    console.log(JSON.stringify(output, null, 2));
  });
}
/* c8 ignore end */
