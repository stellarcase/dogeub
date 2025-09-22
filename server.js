import dotenv from "dotenv";
import express from "express";
import { join } from "node:path";
import { createServer } from "node:http";
import { logging, server as wisp } from "@mercuryworkshop/wisp-js/server";
import { createBareServer } from "@tomphttp/bare-server-node";
import { MasqrMiddleware } from "./masqr.js";

dotenv.config();
logging.set_level(logging.NONE);

const port = process.env.PORT || 2345;
const bare = process.env.BARE !== "false" ? createBareServer("/seal/") : null;
const server = createServer();
const app = express();

// Bare/Wisp upgrades
server.on("upgrade", (req, sock, head) => {
  if (bare?.shouldRoute(req)) bare.routeUpgrade(req, sock, head);
  else if (req.url.endsWith("/wisp/")) wisp.routeRequest(req, sock, head);
  else sock.end();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(join(process.cwd(), "dist")));
if (process.env.MASQR === "true") app.use(MasqrMiddleware);

// Proxy helper
const proxy = (url, type = "application/javascript") => async (req, res) => {
  try {
    const response = await fetch(url(req));
    if (!response.ok) return res.sendStatus(response.status);
    res.type(response.headers.get("content-type") || type);
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.sendStatus(500);
  }
};

// Routes
app.get("/assets/img/*", proxy(req => `https://dogeub-assets.pages.dev/img/${req.params[0]}`));
app.get("/js/script.js", proxy(() => "https://byod.privatedns.org/js/script.js"));

app.get("/return", async (req, res) => {
  if (!req.query.q) return res.status(401).json({ error: "query parameter?" });
  try {
    const r = await fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(req.query.q)}`);
    const data = await r.json();
    res.json(data);
  } catch {
    res.status(500).json({ error: "request failed" });
  }
});

// SPA / 404 fallback
app.use((req, res) => {
  if (req.method === "GET" && req.headers.accept?.includes("text/html")) {
    res.sendFile(join(process.cwd(), "dist/index.html"));
  } else {
    res.status(404).json({ error: "Not Found" });
  }
});

// Normal server listen
server.on("request", (req, res) => {
  if (bare?.shouldRoute(req)) bare.routeRequest(req, res);
  else app(req, res);
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
