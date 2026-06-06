const memory = new Map();

function hasRedis() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

async function redisRequest(command) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    throw new Error(`Redis request failed: ${response.status}`);
  }

  return response.json();
}

async function getCache(key) {
  if (!hasRedis()) {
    const entry = memory.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      memory.delete(key);
      return null;
    }
    return entry.value;
  }

  const result = await redisRequest(["GET", key]);
  return result?.result ? JSON.parse(result.result) : null;
}

async function setCache(key, value, ttlSeconds = 30) {
  if (!hasRedis()) {
    memory.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
    return;
  }

  await redisRequest(["SET", key, JSON.stringify(value), "EX", ttlSeconds]);
}

async function acquireLock(key, ttlSeconds = 10) {
  if (!hasRedis()) {
    const entry = memory.get(key);
    if (entry && Date.now() < entry.expiresAt) {
      return { acquired: false };
    }

    memory.set(key, {
      value: "1",
      expiresAt: Date.now() + ttlSeconds * 1000
    });

    return { acquired: true };
  }

  const result = await redisRequest(["SET", key, "1", "EX", ttlSeconds, "NX"]);
  return { acquired: result?.result === "OK" };
}

module.exports = {
  getCache,
  setCache,
  acquireLock
};
