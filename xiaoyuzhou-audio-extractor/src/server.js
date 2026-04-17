const http = require("node:http");
const { ExtractorError, extractEpisodeAudio } = require("./extractor");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const API_KEY = process.env.XIAOYUZHOU_EXTRACTOR_API_KEY || "";

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function isAuthorized(request) {
  if (!API_KEY) {
    return true;
  }
  return request.headers["x-api-key"] === API_KEY;
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    throw new ExtractorError("INVALID_REQUEST", "request body is required", 400);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new ExtractorError("INVALID_REQUEST", "request body must be valid JSON", 400);
  }
}

function handleHealth(_request, response) {
  sendJson(response, 200, {
    ok: true,
    service: "xiaoyuzhou-audio-extractor",
  });
}

async function handleExtract(request, response) {
  if (!isAuthorized(request)) {
    sendJson(response, 401, {
      ok: false,
      error_code: "UNAUTHORIZED",
      message: "invalid API key",
    });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const episodeUrl = body?.episode_url;
    const result = await extractEpisodeAudio(episodeUrl);
    sendJson(response, 200, result);
  } catch (error) {
    if (error instanceof ExtractorError) {
      sendJson(response, error.statusCode, {
        ok: false,
        error_code: error.code,
        message: error.message,
      });
      return;
    }

    sendJson(response, 500, {
      ok: false,
      error_code: "INTERNAL_ERROR",
      message: error?.message || "internal server error",
    });
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/healthz") {
    handleHealth(request, response);
    return;
  }

  if (request.method === "POST" && request.url === "/extract-xiaoyuzhou-audio") {
    await handleExtract(request, response);
    return;
  }

  sendJson(response, 404, {
    ok: false,
    error_code: "NOT_FOUND",
    message: "route not found",
  });
});

function shutdown(signal) {
  console.log(`received ${signal}, shutting down`);
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

server.listen(PORT, HOST, () => {
  console.log(`xiaoyuzhou-audio-extractor listening on http://${HOST}:${PORT}`);
});
