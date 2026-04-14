let appPromise;

async function loadApp() {
  if (!appPromise) {
    appPromise = import("../src/artifacts/api-server/dist/app.mjs").then(
      (module) => module.default ?? module
    );
  }

  return appPromise;
}

function joinPath(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join("/");
  }

  return value ?? "";
}

module.exports = async function handler(req, res) {
  const [, rawSearch = ""] = (req.url ?? "/api").split("?");
  const params = new URLSearchParams(rawSearch);
  const forwardedPath = joinPath(params.getAll("path"));

  params.delete("path");

  req.url = `/api${forwardedPath ? `/${forwardedPath}` : ""}${
    params.toString() ? `?${params.toString()}` : ""
  }`;

  const app = await loadApp();

  return app(req, res);
};
