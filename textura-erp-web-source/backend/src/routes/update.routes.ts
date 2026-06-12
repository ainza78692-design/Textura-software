import path from "node:path";
import { Router } from "express";
import express from "express";
import { env } from "../config/env";

export const updateRouter = Router();

const updateDir = env.UPDATE_DIR?.trim();

if (updateDir) {
  updateRouter.use(
    "/downloads",
    express.static(path.resolve(updateDir), {
      fallthrough: false,
      immutable: false,
      maxAge: "5m",
    }),
  );

  updateRouter.get("/latest.json", (_req, res) => {
    res.sendFile(path.join(path.resolve(updateDir), "latest.json"));
  });
} else {
  updateRouter.get("/latest.json", (_req, res) => {
    res.status(503).json({
      error: {
        code: "UPDATES_DISABLED",
        message: "Desktop updates are not configured on this server.",
      },
    });
  });
}
