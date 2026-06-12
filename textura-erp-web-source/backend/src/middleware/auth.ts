import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { AuthUser } from "../types/domain";
import { ApiError } from "./api-error";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new ApiError(401, "Authentication required", "UNAUTHORIZED");
  }

  try {
    req.user = jwt.verify(header.slice("Bearer ".length), env.JWT_SECRET) as AuthUser;
    next();
  } catch {
    throw new ApiError(401, "Invalid or expired token", "UNAUTHORIZED");
  }
}
