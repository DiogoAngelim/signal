import express, { type Express, type NextFunction } from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { createSignalApiRouter } from "./api";
import { resolveClientDir } from "./client";

export interface CreateSignalServerOptions {
  basePath?: string;
  serveClient?: boolean;
  clientPath?: string;
}

export function createSignalServer(
  options: CreateSignalServerOptions = {},
): Express {
  const app: Express = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const basePath = options.basePath ?? "/api";
  app.use(basePath, createSignalApiRouter());

  const shouldServeClient = options.serveClient ?? true;
  const clientPath = options.clientPath ?? resolveClientDir();

  if (shouldServeClient && fs.existsSync(clientPath)) {
    app.use(express.static(clientPath));

    const indexPath = path.join(clientPath, "index.html");

    app.get("*", (req, res, next: NextFunction) => {
      if (req.path.startsWith(basePath)) {
        next();
        return;
      }

      if (!fs.existsSync(indexPath)) {
        res.status(404).send("Client assets not found.");
        return;
      }

      res.sendFile(indexPath);
    });
  }

  return app;
}
