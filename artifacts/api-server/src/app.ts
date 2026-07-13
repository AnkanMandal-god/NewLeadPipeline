import express, { type Express } from "express";
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
if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI must be set to store sessions.");
}

app.set("trust proxy", 1);
app.use(
  session({
    name: "vp.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI, collectionName: "sessions" }),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
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
