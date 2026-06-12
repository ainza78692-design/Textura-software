import type { NextFunction, Request, Response } from "express";
import type { Role } from "../types/domain";
import { ApiError } from "./api-error";

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new ApiError(401, "Authentication required", "UNAUTHORIZED");
    if (!roles.includes(req.user.role)) {
      throw new ApiError(403, "You do not have access to this action", "FORBIDDEN");
    }
    next();
  };
}
