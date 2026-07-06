import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "./api-error";
import { findUserByEmail, rowToAuthUser } from "../repositories/user.repository";
import type { AuthUser } from "../types/domain";

const YES_FASHION_EMAIL = "yesfashion@gmail.com";

async function yesFashionUser() {
  const row = await findUserByEmail(YES_FASHION_EMAIL);
  if (!row) {
    throw new ApiError(
      409,
      "The existing Yes Fashion user yesfashion@gmail.com was not found. Create or restore that user before using the app.",
      "YES_FASHION_USER_MISSING",
    );
  }
  return rowToAuthUser(row);
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (header?.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(header.slice("Bearer ".length), env.JWT_SECRET) as AuthUser;
      next();
      return;
    } catch {
      // Fall through to the fixed Yes Fashion profile. This desktop app has no sign-in UX.
    }
  }

  try {
    req.user = await yesFashionUser();
    next();
  } catch (error) {
    next(error);
  }
}
