import type { IncomingMessage, ServerResponse } from "node:http";
import { handleLiquidityManagerApiRequest } from "./handler.js";
import { toRequest, writeResponse } from "./http.js";

type ViteLikePlugin = {
  name: string;
  configureServer(server: {
    middlewares: {
      use(
        handler: (
          req: IncomingMessage,
          res: ServerResponse,
          next: () => void,
        ) => void | Promise<void>,
      ): void;
    };
  }): void;
};

export function liquidityManagerApiPlugin(): ViteLikePlugin {
  return {
    name: "liquidity-manager-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          next();
          return;
        }

        try {
          const request = await toRequest(req);
          const response = await handleLiquidityManagerApiRequest(request);
          await writeResponse(res, response);
        } catch {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(
            JSON.stringify({
              ok: false,
              message: "The local API could not complete the request.",
            }),
          );
        }
      });
    },
  };
}
