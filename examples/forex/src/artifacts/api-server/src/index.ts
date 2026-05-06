import app from "./app";
import { logger } from "./lib/logger";
import { startBackgroundSignalEngine } from "./lib/signal-backend";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { setSignalBroadcast } from "./lib/signal-backend";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Broadcast helper
function broadcastSignal(data: any) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(msg);
    }
  });
}

setSignalBroadcast(broadcastSignal);

server.listen(port, () => {
  logger.info({ port }, "Server listening");
  // Log memory usage every 30 seconds
  setInterval(() => {
    const mem = process.memoryUsage();
    logger.info({
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
    }, "Memory usage");
  }, 30000);
  void startBackgroundSignalEngine().catch((startupError) => {
    logger.error(
      { err: startupError },
      "Background signal engine failed to start",
    );
  });
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
