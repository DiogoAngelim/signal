import fs from "node:fs";
import path from "node:path";

export function resolveClientDir(): string {
  return path.resolve(__dirname, "..", "client");
}

export function clientAssetsAvailable(): boolean {
  return fs.existsSync(resolveClientDir());
}
