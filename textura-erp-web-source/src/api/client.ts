import { getStoredString, removeStoredString, setStoredString } from "@/lib/desktop-store";
import type { AuthResponse, FixedProfile } from "@/types/api";

const TOKEN_KEY = "auth_token";
const SERVER_URL_KEY = "server_origin";
const PROFILE_KEY = "active_profile";
const LEGACY_TOKEN_KEY = "textile_flow_token";
const LEGACY_SERVER_URL_KEY = "textura_server_url";
const CONNECTION_TEST_TIMEOUT_MS = 8000;
const API_REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_PROFILE: FixedProfile = "yes_fashion";

function defaultServerOrigin() {
  try {
    return normalizeServerUrl(import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api");
  } catch {
    return "http://localhost:4000";
  }
}

function normalizeProfile(value: string | null): FixedProfile {
  return value === "test_user" ? "test_user" : DEFAULT_PROFILE;
}

export function normalizeServerUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter a server URL or IP address.");

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;

  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("Enter a valid server URL, for example 192.168.31.43:4000.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Server URL must start with http:// or https://.");
  }

  const pathname = url.pathname.replace(/\/+$/, "");
  if (pathname && pathname.toLowerCase() !== "/api") {
    throw new Error("Use the server root URL or /api URL only.");
  }

  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.origin;
}

export async function getServerOrigin() {
  if (typeof window === "undefined") return defaultServerOrigin();

  const saved = await getStoredString(SERVER_URL_KEY, LEGACY_SERVER_URL_KEY);
  if (!saved) return defaultServerOrigin();

  try {
    return normalizeServerUrl(saved);
  } catch {
    await removeStoredString(SERVER_URL_KEY, LEGACY_SERVER_URL_KEY);
    return defaultServerOrigin();
  }
}

export async function setServerOrigin(input: string) {
  const normalized = normalizeServerUrl(input);
  if (typeof window !== "undefined") {
    const previous = await getServerOrigin();
    await setStoredString(SERVER_URL_KEY, normalized, LEGACY_SERVER_URL_KEY);
    if (previous !== normalized) await clearAuthToken();
  }
  return normalized;
}

export async function apiBaseUrl() {
  return `${await getServerOrigin()}/api`;
}

export async function testServerConnection(input: string) {
  const origin = normalizeServerUrl(input);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), CONNECTION_TEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(`${origin}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Server connection timed out.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) throw new Error(`Server responded with ${response.status}.`);
  return origin;
}

export async function getAuthToken() {
  if (typeof window === "undefined") return null;
  return getStoredString(TOKEN_KEY, LEGACY_TOKEN_KEY);
}

export async function setAuthToken(token: string) {
  if (typeof window === "undefined") return;
  await setStoredString(TOKEN_KEY, token, LEGACY_TOKEN_KEY);
}

export async function clearAuthToken() {
  if (typeof window === "undefined") return;
  await removeStoredString(TOKEN_KEY, LEGACY_TOKEN_KEY);
}

async function refreshFixedProfileToken() {
  const profile = normalizeProfile(await getStoredString(PROFILE_KEY));
  const baseUrl = await apiBaseUrl();
  const response = await fetch(`${baseUrl}/auth/auto-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiClientError(
      data?.error?.message ?? "Unable to refresh desktop session",
      response.status,
      data?.error?.code,
    );
  }

  const result = data as AuthResponse;
  await setAuthToken(result.token);
  return result.token;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

async function fetchApi(path: string, init: RequestInit, token: string | null) {
  const baseUrl = await apiBaseUrl();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
      signal: init.signal ?? controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Server request timed out.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let token = await getAuthToken();
  let response = await fetchApi(path, init, token);

  if (response.status === 401 && !path.startsWith("/auth/")) {
    token = await refreshFixedProfileToken();
    response = await fetchApi(path, init, token);
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiClientError(
      data?.error?.message ?? "Request failed",
      response.status,
      data?.error?.code,
    );
  }

  return data as T;
}
