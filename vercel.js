// vercel-server.js
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createBareServer } from "@tomphttp/bare-server-node";

const __dirname = dirname(fileURLToPath(import.meta.url));

const bare = createBareServer("/seal/"); // Bare mount
const app = Fastify({ logger: false });

// cookies
await app.register(fastifyCookie);

// static frontend
app.register(fastifyStatic, {
  root: join(__dirname, "dist"),
  prefix: "/",
  decorateReply: true
});

// proxy helpers
const proxy = (url, type="application/javascript") => async (req, reply) => {
  try {
    const res = await fetch(url(req)); 
    if (!res.ok) return reply.code(res.status).send();
    if (res.headers.get("content-type")) reply.type(res.headers.get("content-type")); 
    else reply.type(type);
    return reply.send(Buffer.from(await res.arrayBuffer()));
  } catch {
    return reply.code(500).send();
  }
};

// API routes
app.get("/assets/img/*", proxy(req => `https://dogeub-assets.pages.dev/img/${req.params["*"]}`, ""));
app.get("/js/script.js", proxy(()=> "https://byod.privatedns.org/js/script.js"));
app.get("/return", async (req, reply) =>
  req.query?.q
    ? fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(req.query.q)}`)
        .then(r => r.json()).catch(()=>reply.code(500).send({error:"request failed"}))
    : reply.code(401).send({ error: "query parameter?" })
);

// Bare upgrade/requests
app.server.on("upgrade", (req, sock, head) =>
  bare.shouldRoute(req) ? bare.routeUpgrade(req, sock, head) : sock.end()
);
app.server.on("request", (req, res) =>
  bare.shouldRoute(req) ? bare.routeRequest(req, res) : app.server.emit("request", req, res)
);

// 404 fallback → index.html
app.setNotFoundHandler((req, reply) =>
  req.raw.method==="GET" && req.headers.accept?.includes("text/html")
    ? reply.sendFile("index.html")
    : reply.code(404).send({ error: "Not Found" })
);

// Vercel handler
export default async function handler(req, res) {
  await app.ready();
  app.server.emit("request", req, res);
}
