import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as authApi from "@/api/auth";
import { getAuthToken, setAuthToken } from "@/api/client";
import type { AuthUser } from "@/types/api";

interface AuthContextValue {
  session: { user: AuthUser } | null;
  user: AuthUser | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  setAuthenticated: (user: AuthUser, token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// System user for unauthenticated access
const SYSTEM_USER: AuthUser = {
  id: "system-user",
  email: "system@textura.local",
  fullName: "System User",
  role: "operator",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    const token = await getAuthToken();
    
    // If no token exists, use system user (no auth required)
    if (!token) {
      setUser(SYSTEM_USER);
      setLoading(false);
      return;
    }

    try {
      const result = await authApi.getCurrentUser();
      setUser(result.user);
    } catch {
      // On auth error, fall back to system user
      setUser(SYSTEM_USER);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshUser();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session: user ? { user } : null,
        user,
        loading,
        refreshUser,
        setAuthenticated: async (nextUser, token) => {
          await authApi.logout();
          await setAuthToken(token);
          setUser(nextUser);
        },
        signOut: async () => {
          await authApi.logout();
          // Reset to system user instead of null
          setUser(SYSTEM_USER);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
