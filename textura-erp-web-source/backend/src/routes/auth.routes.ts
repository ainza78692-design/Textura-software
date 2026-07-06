import { Router } from "express";
import * as controller from "../controllers/auth.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/require-role";

export const authRouter = Router();

authRouter.post("/auto-session", asyncHandler(controller.autoSession));
authRouter.post("/login", asyncHandler(controller.login));
authRouter.post("/bootstrap-admin", asyncHandler(controller.bootstrapAdmin));
authRouter.get("/me", requireAuth, asyncHandler(controller.me));
authRouter.post("/register", requireAuth, requireRole("admin"), asyncHandler(controller.register));

