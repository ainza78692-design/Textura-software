import { apiRequest, clearAuthToken, setAuthToken } from "./client";
import type { AuthResponse, AuthUser, Role } from "../types/auth";

export async function login(email: string, password: string) {
  const result = await apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  setAuthToken(result.token);
  return result;
}

export async function register(input: {
  fullName: string;
  email: string;
  password: string;
  role?: Role;
}) {
  const result = await apiRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input)
  });
  setAuthToken(result.token);
  return result;
}

export function logout() {
  clearAuthToken();
}

export function getCurrentUser() {
  return apiRequest<{ user: AuthUser }>("/auth/me");
}
