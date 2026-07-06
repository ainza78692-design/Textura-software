import { apiRequest, clearAuthToken, setAuthToken } from "./client";
import type { AuthResponse, AuthUser, FixedProfile, Role } from "@/types/api";

export async function autoSession(profile: FixedProfile) {
  const result = await apiRequest<AuthResponse>("/auth/auto-session", {
    method: "POST",
    body: JSON.stringify({ profile }),
  });
  await setAuthToken(result.token);
  return result;
}

export async function login(email: string, password: string) {
  const result = await apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  await setAuthToken(result.token);
  return result;
}

export async function bootstrapAdmin(input: { fullName: string; email: string; password: string }) {
  const result = await apiRequest<AuthResponse>("/auth/bootstrap-admin", {
    method: "POST",
    body: JSON.stringify(input),
  });
  await setAuthToken(result.token);
  return result;
}

export async function registerUser(input: {
  fullName: string;
  email: string;
  password: string;
  role: Role;
}) {
  return apiRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function logout() {
  await clearAuthToken();
}

export function getCurrentUser() {
  return apiRequest<{ user: AuthUser }>("/auth/me");
}
