/** Runs the API on Node's HTTP server (local development, Docker). */
import http from "node:http";
import { Readable } from "node:stream";
import { closeRedis } from "@wvp/services";
import { createApp } from "./app";
import { createDeps } from "./deps";

const deps = createDeps();
const app = createApp(deps);

const server = http.createServer(async (req, res) => {
  try {
    const url = `http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`;
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const request = new Request(url, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
      // required by Node's fetch implementation for streamed bodies
      ...(hasBody && { duplex: "half" }),
    } as RequestInit);
    const response = await app(request, { ip: req.socket.remoteAddress ?? "unknown" });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body as never).pipe(res);
    else res.end();
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: (e as Error).message }));
  }
});

server.listen(deps.config.port, () => {
  deps.log.logInformation(`Web Vitals Profiler API listening on ${deps.config.port}`, { store: deps.store.kind, env: deps.config.env });
});

const shutdown = () => {
  server.close(() => void closeRedis().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
