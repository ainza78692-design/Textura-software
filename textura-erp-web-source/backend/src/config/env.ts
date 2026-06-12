import "dotenv/config";
import { z } from "zod";

const envBoolean = z.preprocess((value) => {
  if (typeof value === "string") return value.toLowerCase() === "true";
  return value;
}, z.boolean());

const corsOrigins = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}, z.array(z.string().url()).min(1));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default("/api"),
  CORS_ORIGIN: corsOrigins.default(["http://localhost:5173"]),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),
  DB_SSL: envBoolean.default(false),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  BOOTSTRAP_ADMIN_ENABLED: envBoolean.default(true),
  UPDATE_DIR: z.string().optional(),
  RELEASE_VERSION: z.string().default("development"),
  DEPLOYMENT_SLOT: z.string().default("local"),
});

export const env = envSchema.parse(process.env);
