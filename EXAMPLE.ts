// Quick example demonstrating Signal usage

import { Signal, MemoryAdapter, InMemoryTransport, AuthProvider, createContext } from "./index";

async function example() {
  // 1. Create and configure Signal
  const signal = new Signal();
  signal.configure({
    db: new MemoryAdapter(),
    transport: new InMemoryTransport(),
  });

  // 2. Define collection with queries and mutations
  signal
    .collection("posts")
    .access({
      query: { list: "public", mine: "auth" },
      mutation: { create: "auth" },
    })
    .query("list", async (params, ctx) => {
      return await ctx.db.find("posts", { published: true });
    })
    .query("mine", async (params, ctx) => {
      const userId = ctx.auth.user?.id;
      return await ctx.db.find("posts", { authorId: userId });
    })
    .mutation("create", async (params: any, ctx) => {
      const id = await ctx.db.insert("posts", {
        title: params.title,
        authorId: ctx.auth.user?.id,
        published: params.published || false,
      });
      await ctx.emit("posts.created", { id, title: params.title });
      return { id };
    });

  // 3. Start Signal
  await signal.start();

  // 4. Execute queries
  const publicCtx = createContext()
    .withDB(signal.getConfig().db)
    .withAuth(AuthProvider.anonymous())
    .withEmit(async () => { })
    .build();

  const authCtx = createContext()
    .withDB(signal.getConfig().db)
    .withAuth(AuthProvider.authenticated("user123"))
    .withEmit(async (name, payload) => {
      console.log(`Event: ${name}`, payload);
    })
    .build();

  // Query: List public posts
  const posts = await signal.query("posts.list", {}, publicCtx);
  console.log("Public posts:", posts);

  // Mutation: Create post
  const result = await signal.mutation("posts.create", {
    title: "Hello World",
    published: true,
  }, authCtx);
  console.log("Created:", result);

  // Query: My posts
  const myPosts = await signal.query("posts.mine", {}, authCtx);
  console.log("My posts:", myPosts);
}

example().catch(console.error);
