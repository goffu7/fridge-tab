import { env } from "./env";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { loadMember, requireMember } from "./auth";
import { migrate } from "./db";
import { errorHandler } from "./http";
import { account } from "./routes/account";
import { bills } from "./routes/bills";
import { money } from "./routes/money";
import { scan } from "./routes/scan";
import { state } from "./routes/state";

await migrate();

const app = express();
app.set("trust proxy", 1); // behind the host's proxy (Render, Fly, …)
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: { directives: { "img-src": ["'self'", "data:", "blob:"] } } }));
app.use(express.json({ limit: "200kb" }));
app.use(cookieParser());

const api = express.Router();
api.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }));
api.use(loadMember);
api.get("/health", (_req, res) => void res.json({ ok: true }));
api.use(account);
api.use("/state", requireMember, state);
api.use("/bills", requireMember, bills);
api.use("/scan", requireMember, scan);
api.use(requireMember, money);
api.use((_req, res) => void res.status(404).json({ error: "Not found" }));
app.use("/api", api);

// In production the server also serves the built React app.
const web = resolve(dirname(fileURLToPath(import.meta.url)), "../../client/dist");
if (existsSync(web)) {
  // Hashed files in /assets never change; everything else must be revalidated.
  app.use(express.static(web, {
    index: false,
    setHeaders: (res, path) => res.setHeader("Cache-Control", /[\\/]assets[\\/]/.test(path) ? "public, max-age=31536000, immutable" : "no-cache"),
  }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.set("Cache-Control", "no-cache").sendFile(resolve(web, "index.html")));
}

app.use(errorHandler);
app.listen(env.port, () => console.log(`Fridge Tab API on http://localhost:${env.port}`));
