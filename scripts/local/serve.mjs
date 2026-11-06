// Static server for the local build (dist-local/), with SPA fallback.
// When liveReload is enabled it injects a tiny SSE client that reloads on rebuild.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dist } from "./build.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

const RELOAD_SCRIPT = `<script>new EventSource("/__live").onmessage = () => location.reload();</script>`;

const clients = new Set();

export function broadcastReload() {
  for (const res of clients) res.write("data: reload\n\n");
}

export function startServer({ port = Number(process.env.PORT || 8080), host = process.env.HOST || "0.0.0.0", liveReload = false } = {}) {
  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");

    if (pathname === "/__live") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("retry: 1000\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    let file = path.join(dist, path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, ""));
    if (!file.startsWith(dist)) return res.writeHead(403).end("Forbidden");
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const index = path.join(file, "index.html");
      file = fs.existsSync(index) ? index : path.join(dist, "index.html");
    }

    const ext = path.extname(file).toLowerCase();
    if (!fs.existsSync(file)) return res.writeHead(404).end("Not found");

    if (ext === ".html") {
      let html = fs.readFileSync(file, "utf8");
      if (liveReload) html = html.replace("</body>", `${RELOAD_SCRIPT}</body>`);
      res.writeHead(200, { "Content-Type": TYPES[".html"], "Cache-Control": "no-cache" });
      return res.end(html);
    }

    res.writeHead(200, {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(file).pipe(res);
  });

  const ping = setInterval(() => {
    for (const res of clients) res.write(": ping\n\n");
  }, 20_000);
  ping.unref();

  server.listen(port, host, () => {
    console.log(`ASCIIFlow local: http://localhost:${port}`);
    console.log(`Serving ${dist} on ${host}:${port}${liveReload ? " (live reload)" : ""}`);
  });
  return server;
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isMain) {
  if (!fs.existsSync(path.join(dist, "index.html"))) {
    console.error(`No build found in ${dist}. Run: npm run build:local`);
    process.exit(1);
  }
  startServer();
}
