export type Role = "operator" | "admin" | "management";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}
