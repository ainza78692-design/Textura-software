import type { Request, Response } from "express";
import * as authService from "../services/auth.service";
import { autoSessionSchema, loginSchema, registerSchema } from "../validators/auth.validators";

export async function autoSession(req: Request, res: Response) {
  const payload = autoSessionSchema.parse(req.body);
  const result = await authService.autoSession(payload.profile);
  res.json(result);
}

export async function register(req: Request, res: Response) {
  const payload = registerSchema.parse(req.body);
  const result = await authService.register(payload);
  res.status(201).json(result);
}

export async function bootstrapAdmin(req: Request, res: Response) {
  const payload = registerSchema.omit({ role: true }).parse(req.body);
  const result = await authService.bootstrapAdmin(payload);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response) {
  const payload = loginSchema.parse(req.body);
  const result = await authService.login(payload);
  res.json(result);
}

export async function me(req: Request, res: Response) {
  res.json({ user: req.user });
}
