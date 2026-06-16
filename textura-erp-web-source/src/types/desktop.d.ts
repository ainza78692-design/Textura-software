export {};

declare global {
  interface Window {
    texturaDesktop?: {
      getAppInfo: () => Promise<{ name: string; version: string }>;
      checkForUpdates: (serverOrigin: string) => Promise<{
        status: "available" | "current" | "skipped" | "unavailable" | "error";
        manifest?: any;
        currentVersion?: string;
        mandatory?: boolean;
        error?: string;
      }>;
      downloadAndInstallUpdate: (
        serverOrigin: string,
        manifest: any,
      ) => Promise<{ status: "installing" | "error"; error?: string }>;
    };
  }
}
