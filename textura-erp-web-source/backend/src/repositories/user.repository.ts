import { query } from "../db/pool";
import type { AuthUser, Role } from "../types/domain";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  password_hash: string;
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role
  };
}

export async function findUserByEmail(email: string) {
  const result = await query<UserRow>(
    "select id, email, full_name, role, password_hash from app_users where lower(email) = lower($1) and is_active = true",
    [email]
  );
  return result.rows[0] ?? null;
}

export async function createUser(input: {
  fullName: string;
  email: string;
  passwordHash: string;
  role: Role;
}) {
  const result = await query<UserRow>(
    `insert into app_users (full_name, email, password_hash, role)
     values ($1, lower($2), $3, $4)
     returning id, email, full_name, role, password_hash`,
    [input.fullName, input.email, input.passwordHash, input.role]
  );
  return toAuthUser(result.rows[0]);
}

export async function countUsers() {
  const result = await query<{ count: string }>("select count(*)::text as count from app_users");
  return Number(result.rows[0]?.count ?? 0);
}

export function rowToAuthUser(row: UserRow): AuthUser {
  return toAuthUser(row);
}
