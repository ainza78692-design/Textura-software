import type { DocStatus, FinalStatus } from "../types/domain";

export function calculateFinalStatus(statuses: DocStatus[]): FinalStatus {
  if (statuses.some((status) => status === "rejected")) return "rejected";
  if (statuses.length > 0 && statuses.every((status) => status === "approved")) return "approved";
  return "pending";
}
