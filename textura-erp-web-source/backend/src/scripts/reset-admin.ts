import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool, query } from "../db/pool";

const optionsSchema = z.object({
  email: z.string().trim().email(),
  fullName: z.string().trim().min(2).max(80),
  password: z
    .string()
    .min(8)
    .max(72)
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const options = optionsSchema.parse({
    email: readArg("email") ?? process.env.ADMIN_EMAIL,
    fullName: readArg("name") ?? process.env.ADMIN_FULL_NAME ?? "System Administrator",
    password: readArg("password") ?? process.env.ADMIN_PASSWORD,
  });

  const passwordHash = await bcrypt.hash(options.password, 12);
  const result = await query<{ email: string; full_name: string }>(
    `insert into app_users (email, full_name, password_hash, role, is_active)
     values (lower($1), $2, $3, 'admin', true)
     on conflict (email)
     do update set
       full_name = excluded.full_name,
       password_hash = excluded.password_hash,
       role = 'admin',
       is_active = true
     returning email, full_name`,
    [options.email, options.fullName, passwordHash],
  );

  const user = result.rows[0];
  console.log(`Admin ready: ${user.full_name} <${user.email}>`);
}

main()
  .catch((error) => {
    if (error instanceof z.ZodError) {
      console.error("Invalid admin reset input:");
      for (const issue of error.issues)
        console.error(`- ${issue.path.join(".")}: ${issue.message}`);
      console.error(
        'Usage: npm run admin:reset -- --email=admin@example.com --password=StrongPass123 --name="Admin User"',
      );
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
