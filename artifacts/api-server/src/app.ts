import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import session from "express-session";
import MongoStore from "connect-mongo";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set to sign session cookies.");
}

// When MONGODB_URI is absent the server starts in "not_configured" mode:
// sessions use the in-memory store (ephemeral, fine since no real requests
// are handled) and all routes except GET /api/healthz return 503.
const isConfigured = !!process.env.MONGODB_URI;

const sessionStore = isConfigured
  ? MongoStore.create({ mongoUrl: process.env.MONGODB_URI!, collectionName: "sessions" })
  : undefined; // express-session defaults to MemoryStore

app.set("trust proxy", 1);

// When running behind the Replit HTTPS proxy (or in production), the app is
// served over HTTPS even though Express itself runs on plain HTTP. In that
// case we need SameSite=None; Secure so that the session cookie is accepted
// inside Replit's cross-origin preview iframe. Locally (no REPLIT_DEV_DOMAIN,
// not production) we fall back to SameSite=Lax without Secure.
const behindHttpsProxy =
  process.env.NODE_ENV === "production" || !!process.env.REPLIT_DEV_DOMAIN;

app.use(
  session({
    name: "vp.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    ...(sessionStore ? { store: sessionStore } : {}),
    cookie: {
      httpOnly: true,
      sameSite: behindHttpsProxy ? "none" : "lax",
      secure: behindHttpsProxy,
      maxAge: 1000 * 60 * 60 * 24 * 14, // 14 days
    },
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Root redirect → dashboard
app.get("/", (_req, res) => res.redirect(301, "/dashboard/"));

export default app;
