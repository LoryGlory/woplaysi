// Local preview of the status page: `npm run preview`, then open http://localhost:4173
// Serves ./site as-is. Run `npm run dry` (or `npm run once`) first to refresh status.json.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("site");
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".xml": "application/atom+xml" };

http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.join(root, rel === "/" ? "index.html" : rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("not found");
  }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`Wo PlaySi preview: http://localhost:${port}`));
