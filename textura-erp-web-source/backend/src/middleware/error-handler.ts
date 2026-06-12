import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../config/logger";
import { ApiError } from "./api-error";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: error.issues[0]?.message ?? "Invalid request",
        details: error.flatten()
      }
    });
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      error: { code: error.code, message: error.message }
    });
    return;
  }

  logger.error(error, "Unhandled API error");
  res.status(500).json({
    error: { code: "INTERNAL_SERVER_ERROR", message: "Something went wrong" }
  });
};
