import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

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
  const toneColor = {
    default: "var(--primary)",
    success: "var(--success)",
    warning: "var(--warning)",
    destructive: "var(--destructive)",
    info: "var(--info)",
  }[tone];

  const inner = (
    <Card className="interactive-lift group relative overflow-hidden bg-card">
      {/* Cinematic Radial Glow */}
      <div 
        className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-[0.15] blur-[60px] transition-opacity duration-500 group-hover:opacity-[0.25] dark:opacity-[0.12] dark:group-hover:opacity-[0.22]"
        style={{ backgroundColor: toneColor }} 
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent opacity-50" />
      
      <CardContent className="relative z-10 flex items-start justify-between gap-3 p-6">
        <div className="min-w-0">
          <div className="text-[0.68rem] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            {label}
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight tabular-nums text-foreground">{value}</div>
          {delta && <div className="mt-1.5 text-xs font-medium text-muted-foreground/80">{delta}</div>}
        </div>
        
        {/* Glassmorphic Icon Container */}
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background/40 shadow-sm ring-1 ring-border/50 backdrop-blur-md transition-transform duration-500 group-hover:scale-105"
          style={{ color: toneColor }}
        >
          <Icon className="h-5 w-5" />
        </div>
        
        {href && (
          <ArrowUpRight className="absolute right-4 top-4 h-4 w-4 text-muted-foreground opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        )}
      </CardContent>
    </Card>
  );

  return href ? <Link to={href}>{inner}</Link> : inner;
}
