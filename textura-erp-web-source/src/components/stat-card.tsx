import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  delta,
  tone = "default",
  icon: Icon,
  href,
}: {
  label: string;
  value: string | number;
  delta?: string;
  tone?: "default" | "success" | "warning" | "destructive" | "info";
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
}) {
  const toneCls = {
    default: "bg-primary/12 text-primary ring-primary/20",
    success: "bg-success/14 text-success ring-success/20",
    warning: "bg-warning/18 text-warning ring-warning/25",
    destructive: "bg-destructive/14 text-destructive ring-destructive/20",
    info: "bg-info/14 text-info ring-info/20",
  }[tone];

  const inner = (
    <Card className="interactive-lift group relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight tabular-nums">{value}</div>
          {delta && <div className="mt-1 text-xs text-muted-foreground">{delta}</div>}
        </div>
        <div
          className={cn("flex h-11 w-11 items-center justify-center rounded-xl ring-1", toneCls)}
        >
          <Icon className="h-5 w-5" />
        </div>
        {href && (
          <ArrowUpRight className="absolute right-3 top-3 h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </CardContent>
    </Card>
  );

  return href ? <Link to={href}>{inner}</Link> : inner;
}
