let handlerPromise;

async function loadHandler() {
  if (!handlerPromise) {
    handlerPromise = import("./index.js").then(
      (module) => module.default ?? module
    );
  }

  return handlerPromise;
}

module.exports = async function handler(req, res) {
  const resolved = await loadHandler();
  return resolved(req, res);
};
