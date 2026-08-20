// ============================================================================
// serve.js
// A tiny zero-dependency static file server, just for running the sand jar
// locally. Why this exists instead of double-clicking index.html: the app
// uses native ES module <script type="module"> imports, and most browsers
// block module scripts from loading over file:// URLs for security
// reasons. A plain local HTTP server sidesteps that with no build step and
// no external dependencies.
//
// Usage:
//   node serve.js            -> http://localhost:5500
//   node serve.js 8080       -> http://localhost:8080
// ============================================================================

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.argv[2] || "5500", 10);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split("?")[0]);
  if (reqPath === "/") reqPath = "/index.html";

  const filePath = path.normalize(path.join(ROOT, reqPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found: " + reqPath);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\nShyfoxie's LIVE Sand Jar is running:`);
  console.log(`  Test mode:  http://localhost:${PORT}/?mode=test`);
  console.log(`  Live/OBS:   http://localhost:${PORT}/?mode=live`);
  console.log(`  + &debug=true on either URL for the performance overlay\n`);
});
