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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    const token = await getAuthToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const result = await authApi.getCurrentUser();
      setUser(result.user);
    } catch {
      await authApi.logout();
      setUser(null);
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
          setUser(null);
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
