import React, { useEffect, useState } from "react";
// Assuming you have shadcn ui alert-dialog components in your project
// import {
//   AlertDialog,
//   AlertDialogAction,
//   AlertDialogCancel,
//   AlertDialogContent,
//   AlertDialogDescription,
//   AlertDialogFooter,
//   AlertDialogHeader,
//   AlertDialogTitle,
// } from "@/components/ui/alert-dialog";

// Declare global window property for TS
declare global {
  interface Window {
    texturaDesktop: {
      checkForUpdates: (url: string) => Promise<any>;
      downloadUpdate: (manifest: any) => Promise<{ filePath: string }>;
      installUpdate: (filePath: string) => Promise<void>;
    };
  }
}

export function DesktopUpdatePrompt() {
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Update URL - Adjust this according to your actual production domain
  const MANIFEST_URL = "http://100.91.86.65:4000/updates/latest.json";

  useEffect(() => {
    const desktop = window.texturaDesktop;
    if (!desktop) return;

    const checkUpdates = async () => {
      try {
        const result = await desktop.checkForUpdates(MANIFEST_URL);
        if (result.updateAvailable) {
          setUpdateInfo(result);
          setOpen(true);
        }
      } catch (err) {
        console.error("Failed to check for updates:", err);
      }
    };

    // Check immediately on mount
    checkUpdates();
    
    // Check every 6 hours
    const timer = setInterval(checkUpdates, 6 * 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const handleInstall = async () => {
    if (!updateInfo || !window.texturaDesktop) return;
    
    setInstalling(true);
    setError(null);
    try {
      const downloaded = await window.texturaDesktop.downloadUpdate(updateInfo.manifest);
      await window.texturaDesktop.installUpdate(downloaded.filePath);
    } catch (err: any) {
      console.error("Update failed", err);
      setError(err.message || "Failed to download and install the update.");
      setInstalling(false);
    }
  };

  if (!open || !updateInfo) return null;

  return (
    // Replace this standard div overlay with Shadcn UI <AlertDialog> if available:
    /*
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Update Available</AlertDialogTitle>
          <AlertDialogDescription>
             ...
          </AlertDialogDescription>
        </AlertDialogHeader>
        ...
      </AlertDialogContent>
    </AlertDialog>
    */
    
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Update Available: {updateInfo.manifest.latestVersion || updateInfo.manifest.version}
        </h2>
        
        <div className="text-slate-600 dark:text-slate-300 space-y-2">
          <p>You are currently on version {updateInfo.currentVersion}.</p>
          {updateInfo.manifest.releaseNotesUrl && (
            <p>
              <a 
                href={updateInfo.manifest.releaseNotesUrl} 
                target="_blank" 
                rel="noreferrer"
                className="text-blue-500 hover:underline"
              >
                View Release Notes
              </a>
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {installing ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-4">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Downloading update... Please wait, the app will restart shortly.
            </p>
          </div>
        ) : (
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            {!updateInfo.mandatory && (
              <button 
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-md font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
              >
                Later
              </button>
            )}
            <button 
              onClick={handleInstall}
              className="px-4 py-2 rounded-md font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              Download and Install
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
