import app from "../artifacts/api-server/dist/app.mjs";

function joinPath(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join("/");
  }

  return value ?? "";
}

export default function handler(req, res) {
  const [, rawSearch = ""] = (req.url ?? "/api").split("?");
  const params = new URLSearchParams(rawSearch);
  const forwardedPath = joinPath(params.getAll("path"));

  params.delete("path");

  req.url = `/api${forwardedPath ? `/${forwardedPath}` : ""}${
    params.toString() ? `?${params.toString()}` : ""
  }`;

  return app(req, res);
}
