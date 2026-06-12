import { Router, type Request, type Response } from "express";
import { env } from "../config/env";
import { pool } from "../db/pool";

export const healthRouter = Router();

function deploymentInfo() {
  return {
    release: env.RELEASE_VERSION,
    slot: env.DEPLOYMENT_SLOT,
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

healthRouter.get("/health/live", (_req, res) => {
  res.json({ status: "ok", ...deploymentInfo() });
});

async function readiness(_req: Request, res: Response) {
  try {
    await pool.query("select 1");
    res.json({ status: "ok", database: "available", ...deploymentInfo() });
  } catch {
    res
      .status(503)
      .json({ status: "error", database: "unavailable", ...deploymentInfo() });
  }
}

healthRouter.get("/health", readiness);
healthRouter.get("/health/ready", readiness);
