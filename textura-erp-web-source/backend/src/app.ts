import cors from "cors";
import type { CorsOptions } from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { errorHandler } from "./middleware/error-handler";
import { authRouter } from "./routes/auth.routes";
import { healthRouter } from "./routes/health.routes";
import { invoiceRouter } from "./routes/invoice.routes";
import { updateRouter } from "./routes/update.routes";

function isTrustedDesktopOrigin(origin: string) {
  if (origin === "null") return true;

  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

const corsOrigin: CorsOptions["origin"] = (origin, callback) => {
  if (!origin) {
    callback(null, true);
    return;
  }

  if (env.CORS_ORIGIN.includes(origin) || isTrustedDesktopOrigin(origin)) {
    callback(null, true);
    return;
  }

  callback(null, false);
};

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));

  app.use(healthRouter);
  app.use("/updates", updateRouter);
  app.use(`${env.API_PREFIX}/auth`, authRouter);
  app.use(`${env.API_PREFIX}/invoices`, invoiceRouter);

  app.use(errorHandler);
  return app;
}
