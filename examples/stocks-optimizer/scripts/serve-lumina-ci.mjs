/**
 * Local CI-only adapter: serves the same Express app Vercel bundles, without
 * starting the separate background Signal engine or any trading worker.
 */
import { createServer } from "node:http";
import app from "../src/artifacts/api-server/dist/app.mjs";

const port = Number(process.env.LUMINA_CI_API_PORT || 4010);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Invalid LUMINA_CI_API_PORT");
}
const server = createServer(app);
server.listen(port, "127.0.0.1", () => {
  console.info("Lúmina CI API on http://127.0.0.1:" + port);
});
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
