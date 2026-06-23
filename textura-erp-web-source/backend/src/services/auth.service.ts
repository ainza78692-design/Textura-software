import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "../middleware/api-error";
import { countUsers, createUser, findUserByEmail, rowToAuthUser } from "../repositories/user.repository";
import type { AuthUser } from "../types/domain";

function signToken(user: AuthUser) {
  return jwt.sign(user, env.JWT_SECRET);
}

export async function register(input: {
  fullName: string;
  email: string;
  password: string;
  role: "operator" | "admin" | "management";
}) {
  const existing = await findUserByEmail(input.email);
  if (existing) throw new ApiError(409, "Email is already registered", "EMAIL_EXISTS");

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await createUser({
    fullName: input.fullName,
    email: input.email,
    passwordHash,
    role: input.role
  });

  return { user, token: signToken(user) };
}

export async function login(input: { email: string; password: string }) {
  const row = await findUserByEmail(input.email);
  if (!row) throw new ApiError(401, "Invalid email or password", "INVALID_CREDENTIALS");

  const valid = await bcrypt.compare(input.password, row.password_hash);
  if (!valid) throw new ApiError(401, "Invalid email or password", "INVALID_CREDENTIALS");

  const user = rowToAuthUser(row);
  return { user, token: signToken(user) };
}

export async function bootstrapAdmin(input: {
  fullName: string;
  email: string;
  password: string;
}) {
  if (!env.BOOTSTRAP_ADMIN_ENABLED) {
    throw new ApiError(403, "Admin bootstrap is disabled", "BOOTSTRAP_DISABLED");
  }

  const totalUsers = await countUsers();
  if (totalUsers > 0) {
    throw new ApiError(409, "Admin bootstrap is only allowed before users exist", "BOOTSTRAP_CLOSED");
  }

  return register({ ...input, role: "admin" });
}
