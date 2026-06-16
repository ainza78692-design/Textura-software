import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Server, Wifi } from "lucide-react";
import { toast } from "sonner";
import {
  getServerOrigin,
  normalizeServerUrl,
  setServerOrigin,
  testServerConnection,
} from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ServerConnectionCardProps {
  className?: string;
  compact?: boolean;
  onServerChanged?: () => void | Promise<void>;
}

export function ServerConnectionCard({
  className,
  compact = false,
  onServerChanged,
}: ServerConnectionCardProps) {
  const [serverOrigin, setServerOriginState] = useState("http://localhost:4000");
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState(serverOrigin);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    getServerOrigin().then((origin) => {
      if (!active) return;
      setServerOriginState(origin);
      setInput(origin);
    });

    return () => {
      active = false;
    };
  }, []);

  const normalizedPreview = (() => {
    try {
      return normalizeServerUrl(input);
    } catch {
      return null;
    }
  })();

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const origin = await testServerConnection(input);
      setMessage(`Connection working: ${origin}`);
      toast.success("Server connection is working");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unable to reach server.";
      setMessage(detail);
      toast.error(detail);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const normalized = await setServerOrigin(input);
      const changed = normalized !== serverOrigin;
      setServerOriginState(normalized);
      setInput(normalized);
      setExpanded(false);
      toast.success("Server saved. Please sign in again if prompted.");
      if (changed) await onServerChanged?.();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unable to save server.";
      setMessage(detail);
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={cn("border-border/80 bg-card/90 shadow-soft", className)}>
      <CardContent className={cn("space-y-4", compact ? "p-5" : "p-6")}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Wifi className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Server className="h-4 w-4 text-muted-foreground" />
                Local server
              </div>
              <p className="truncate text-sm text-muted-foreground" title={serverOrigin}>
                {serverOrigin}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setExpanded((value) => !value);
              setInput(serverOrigin);
              setMessage(null);
            }}
          >
            {expanded ? "Close" : "Change server"}
          </Button>
        </div>

        {expanded && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="server-url">Server URL or IP</Label>
              <Input
                id="server-url"
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setMessage(null);
                }}
                placeholder="192.168.31.43:4000"
                autoComplete="off"
              />
              {normalizedPreview && (
                <p className="text-xs text-muted-foreground">
                  API calls will use {normalizedPreview}/api
                </p>
              )}
            </div>

            {message && (
              <div className="rounded-2xl border border-border bg-muted/45 px-3 py-2 text-xs text-muted-foreground">
                {message}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={testing || !input.trim()}
              >
                {testing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Test connection
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving || !normalizedPreview}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
