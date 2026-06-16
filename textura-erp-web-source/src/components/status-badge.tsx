import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocStatus } from "@/types/api";

const map = {
  approved: { cls: "status-approved", Icon: CheckCircle2, label: "Approved" },
  pending: { cls: "status-pending", Icon: Clock, label: "Pending" },
  rejected: { cls: "status-rejected", Icon: XCircle, label: "Rejected" },
} as const;

export function StatusBadge({
  status,
  className,
  size = "sm",
}: {
  status: DocStatus;
  className?: string;
  size?: "sm" | "md";
}) {
  const { cls, Icon, label } = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold leading-none shadow-sm transition-colors",
        size === "sm" ? "px-2.5 py-1 text-[0.72rem]" : "px-3 py-1.5 text-sm",
        cls,
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {label}
    </span>
  );
}
