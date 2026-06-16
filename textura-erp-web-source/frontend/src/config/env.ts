const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (!apiBaseUrl) {
  throw new Error("Missing VITE_API_BASE_URL. Configure it in the frontend environment.");
}

export const frontendEnv = {
  apiBaseUrl: apiBaseUrl.replace(/\/$/, "")
};
