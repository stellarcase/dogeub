import dotenv from "dotenv";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import { join, dirname } from "node:path";
import { createServer, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { logging, server as wisp } from "@mercuryworkshop/wisp-js/server";
import { createBareServer } from "@tomphttp/bare-server-node";

dotenv.config();
ServerResponse.prototype.setMaxListeners(50);

const __dirname = dirname(fileURLToPath(import.meta.url));

const port = process.env.PORT || 2345;
const server = createServer();
const bare = process.env.BARE !== "false" ? createBareServer("/seal/") : null;
let MasqrMiddleware;
logging.set_level(logging.NONE);

Object.assign(wisp.options, {
  dns_method: "resolve",
  dns_servers: ["1.1.1.3", "1.0.0.3"],
  dns_result_order: "ipv4first",
});

server.on("upgrade", (req, sock, head) =>
  bare?.shouldRoute(req) ? bare.routeUpgrade(req, sock, head)
  : req.url.endsWith("/wisp/") ? wisp.routeRequest(req, sock, head)
  : sock.end()
);

const app = Fastify({
  serverFactory: h => (server.on("request", (req,res) =>
    bare?.shouldRoute(req,res) ? bare.routeRequest(req,res) : h(req,res)), server),
  logger: false
});

await app.register(fastifyCookie);

app.register(fastifyStatic, {
  root: join(__dirname, "dist"),
  prefix: "/",
  decorateReply: true
});

if (process.env.MASQR === "true") {
  const mod = await import("./masqr.js");
  MasqrMiddleware = mod.MasqrMiddleware;
  app.addHook("onRequest", MasqrMiddleware);
}

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

app.get("/assets/img/*", proxy(req => `https://dogeub-assets.pages.dev/img/${req.params["*"]}`, ""));
app.get("/js/script.js", proxy(()=> "https://byod.privatedns.org/js/script.js"));

app.get("/return", async (req, reply) =>
  req.query?.q
    ? fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(req.query.q)}`)
        .then(r => r.json()).catch(()=>reply.code(500).send({error:"request failed"}))
    : reply.code(401).send({ error: "query parameter?" })
);

app.setNotFoundHandler((req, reply) =>
  req.raw.method==="GET" && req.headers.accept?.includes("text/html")
    ? reply.sendFile("index.html")
    : reply.code(404).send({ error: "Not Found" })
);

// --- dual mode ---
if (process.env.VERCEL) {
  // export handler for Vercel
  export default async function handler(req, res) {
    await app.ready();
    app.server.emit("request", req, res);
  }
} else {
  // local NodeJS
  app.listen({ port }).then(() => console.log(`Server running on ${port}`));
}

export { app };
