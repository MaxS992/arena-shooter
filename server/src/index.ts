/**
 * Colyseus server entry. Serves FFA arena room + static client files.
 */

import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ArenaFFARoom } from "./rooms/ArenaFFA.js";
import { serverConfig } from "./config/index.js";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Serve static client files from ../client/dist
const clientDistPath = join(import.meta.dirname ?? ".", "../../client/dist");

const httpServer = createServer((req, res) => {
  // CORS for dev
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Serve static files
  let filePath = join(clientDistPath, req.url === "/" ? "/index.html" : req.url!);

  if (!existsSync(filePath)) {
    // SPA fallback
    filePath = join(clientDistPath, "index.html");
  }

  if (existsSync(filePath)) {
    try {
      const content = readFileSync(filePath);
      const ext = extname(filePath);
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
      res.end(content);
      return;
    } catch {
      // fall through
    }
  }

  res.writeHead(404);
  res.end("Not found");
});

const server = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});
server.define("arena_ffa", ArenaFFARoom);

server.listen(serverConfig.port).then(() => {
  console.log(`Arena server running on http://localhost:${serverConfig.port}`);
  console.log(`Client: http://localhost:${serverConfig.port}`);
  console.log(`WebSocket: ws://localhost:${serverConfig.port}`);
});
