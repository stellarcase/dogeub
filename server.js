import dotenv from "dotenv";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import { join } from "node:path";
import { logging, server as wisp } from "@mercuryworkshop/wisp-js/server";
import { createBareServer } from "@tomphttp/bare-server-node";
import { MasqrMiddleware } from "./masqr.js";

dotenv.config();
logging.set_level(logging.NONE);

const bare = process.env.BARE !== "false" ? createBareServer("/seal/") : null;

Object.assign(wisp.options, {
  dns_method: "resolve",
  dns_servers: ["1.1.1.3", "1.0.0.3"],
  dns_result_order: "ipv4first",
});

const app = Fastify({ logger: false });

await app.register(fastifyCookie);
await app.register(fastifyStatic, {
  root: join(process.cwd(), "dist"),
  prefix: "/",
  decorateReply: true,
});

if (process.env.MASQR === "true") app.addHook("onRequest", MasqrMiddleware);

const proxy = (url, type = "application/javascript") => async (req, reply) => {
  try {
    const res = await fetch(url(req));
    if (!res.ok) return reply.code(res.status).send();
    reply.type(res.headers.get("content-type") || type);
    return reply.send(Buffer.from(await res.arrayBuffer()));
  } catch {
    return reply.code(500).send();
  }
};

app.get("/assets/img/*", proxy(req => `https://dogeub-assets.pages.dev/img/${req.params["*"]}`));
app.get("/js/script.js", proxy(() => "https://byod.privatedns.org/js/script.js"));

app.get("/return", async (req, reply) =>
  req.query?.q
    ? fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(req.query.q)}`)
        .then(r => r.json())
        .catch(() => reply.code(500).send({ error: "request failed" }))
    : reply.code(401).send({ error: "query parameter?" })
);

app.setNotFoundHandler((req, reply) =>
  req.raw.method === "GET" && req.headers.accept?.includes("text/html")
    ? reply.sendFile("index.html")
    : reply.code(404).send({ error: "Not Found" })
);

// Vercel Node.js Serverless Export
export default async function handler(req, res) {
  // Handle upgrades for Bare/Wisp
  if (bare?.shouldRoute(req)) return bare.routeRequest(req, res);
  if (req.url.endsWith("/wisp/")) return wisp.routeRequest(req, res);
  
  await app.ready();
  app.server.emit("request", req, res);
}
