import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as authApi from "@/api/auth";
import { getAuthToken, setAuthToken } from "@/api/client";
import { getStoredString, setStoredString } from "@/lib/desktop-store";
import type { AuthUser, FixedProfile } from "@/types/api";

const PROFILE_KEY = "active_profile";
const DEFAULT_PROFILE: FixedProfile = "yes_fashion";

interface AuthContextValue {
  session: { user: AuthUser } | null;
  user: AuthUser | null;
  profile: FixedProfile;
  loading: boolean;
  refreshUser: () => Promise<void>;
  setAuthenticated: (user: AuthUser, token: string) => Promise<void>;
  switchProfile: (profile: FixedProfile) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function normalizeProfile(value: string | null): FixedProfile {
  return value === "test_user" ? "test_user" : DEFAULT_PROFILE;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<FixedProfile>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);

  const switchProfile = async (nextProfile: FixedProfile) => {
    setLoading(true);
    try {
      const result = await authApi.autoSession(nextProfile);
      await setStoredString(PROFILE_KEY, nextProfile);
      setProfile(nextProfile);
      setUser(result.user);
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async () => {
    setLoading(true);
    const savedProfile = normalizeProfile(await getStoredString(PROFILE_KEY));
    setProfile(savedProfile);
    const token = await getAuthToken();

    if (!token) {
      await switchProfile(savedProfile);
      return;
    }

    try {
      const result = await authApi.getCurrentUser();
      setUser(result.user);
    } catch {
      await switchProfile(savedProfile);
      return;
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
        profile,
        loading,
        refreshUser,
        switchProfile,
        setAuthenticated: async (nextUser, token) => {
          await setAuthToken(token);
          setUser(nextUser);
        },
        signOut: async () => {
          await switchProfile(DEFAULT_PROFILE);
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
