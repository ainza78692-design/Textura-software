export {};

declare global {
  interface Window {
    texturaDesktop?: {
      getAppInfo: () => Promise<{ name: string; version: string }>;
      checkForUpdates: (serverOrigin: string) => Promise<{ status: string }>;
    };
  }
}
