import { useEffect, useState } from "react";
import { getServerOrigin, getAuthToken } from "@/api/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DownloadCloud, Info, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function DesktopUpdatePrompt() {
  const [isOpen, setIsOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    version: string;
    currentVersion: string;
    notes?: string;
    mandatory: boolean;
    manifest: any;
  } | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    // Only run in desktop environment
    if (!window.texturaDesktop?.checkForUpdates) return;

    let mounted = true;

    const check = async () => {
      try {
        const serverOrigin = await getServerOrigin();

        // Don't check for updates if:
        // 1. Still on default localhost (user hasn't configured a real server yet)
        // 2. User is not logged in (no auth token saved)
        const isLocalhost = serverOrigin.includes("localhost") || serverOrigin.includes("127.0.0.1");
        const token = await getAuthToken();
        if (isLocalhost || !token) return;

        const result = await window.texturaDesktop!.checkForUpdates(serverOrigin);

        if (!mounted) return;

        if (result.status === "available" && result.manifest) {
          setUpdateInfo({
            version: result.manifest.version,
            currentVersion: result.currentVersion || "Unknown",
            notes: result.manifest.releaseNotes,
            mandatory: Boolean(result.mandatory),
            manifest: result.manifest,
          });
          setIsOpen(true);
        }
      } catch (error) {
        console.error("Failed to check for updates", error);
      }
    };

    // Initial check after 5 seconds to not block startup
    const initialTimer = window.setTimeout(check, 5000);
    // Recurring check every 6 hours
    const recurringTimer = window.setInterval(check, 6 * 60 * 60 * 1000);

    return () => {
      mounted = false;
      window.clearTimeout(initialTimer);
      window.clearInterval(recurringTimer);
    };
  }, []);

  const handleInstall = async () => {
    if (!updateInfo) return;
    
    setIsInstalling(true);
    try {
      const serverOrigin = await getServerOrigin();
      const result = await window.texturaDesktop!.downloadAndInstallUpdate(
        serverOrigin,
        updateInfo.manifest
      );
      
      if (result.status === "error") {
        throw new Error(result.error || "Update failed");
      }
      
      // If successful, the app will quit itself, so we just wait.
      toast.success("Update downloaded. Restarting app...");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to install update");
      setIsInstalling(false);
    }
  };

  const handleClose = () => {
    if (updateInfo?.mandatory) {
      toast.error("This update is mandatory to continue using the application.");
      return;
    }
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md border-border/50 bg-background/80 backdrop-blur-3xl shadow-2xl overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 h-64 w-64 rounded-full bg-primary/10 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 h-64 w-64 rounded-full bg-primary/10 blur-[100px] pointer-events-none" />

        <DialogHeader className="relative z-10 pt-4 px-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border border-primary/20 shadow-[0_0_30px_rgba(var(--primary),0.3)]">
            <DownloadCloud className="h-8 w-8 text-primary animate-pulse" />
          </div>
          <DialogTitle className="text-2xl text-center font-bold tracking-tight">
            Update Available
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground pt-2">
            A new version of Textura ERP is ready to install.
          </DialogDescription>
        </DialogHeader>

        <div className="relative z-10 px-2 py-4">
          <div className="rounded-xl border border-border/50 bg-muted/50 p-4 space-y-3 shadow-inner">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground font-medium">Latest Version:</span>
              <span className="font-semibold text-primary px-2 py-1 bg-primary/10 rounded-md">
                v{updateInfo?.version}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground font-medium">Current Version:</span>
              <span className="font-medium text-foreground">
                v{updateInfo?.currentVersion}
              </span>
            </div>
            
            {updateInfo?.notes && (
              <div className="pt-2 mt-2 border-t border-border/50">
                <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  <Info className="h-3 w-3" /> Release Notes
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                  {updateInfo.notes}
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="relative z-10 sm:justify-center gap-2 pt-2 pb-4 px-2">
          {!updateInfo?.mandatory && (
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isInstalling}
              className="w-32"
            >
              Later
            </Button>
          )}
          <Button
            type="button"
            onClick={handleInstall}
            disabled={isInstalling}
            className="w-40 relative group overflow-hidden"
          >
            {isInstalling ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Installing...
              </>
            ) : (
              <>
                <div className="absolute inset-0 bg-primary opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
                <span className="relative z-10 flex items-center">
                  <DownloadCloud className="mr-2 h-4 w-4" />
                  Update Now
                </span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
