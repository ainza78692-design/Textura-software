import type { Invoice } from "@/types/api";

export function statusCounts(list: Invoice[]) {
  return {
    total: list.length,
    approved: list.filter((i) => i.final_status === "approved").length,
    pending: list.filter((i) => i.final_status === "pending").length,
    rejected: list.filter((i) => i.final_status === "rejected").length,
  };
}

export function clientApprovalData(list: Invoice[]) {
  const map = new Map<
    string,
    { name: string; approved: number; pending: number; rejected: number }
  >();
  list.forEach((inv) => {
    const entry = map.get(inv.customer_name) ?? {
      name: inv.customer_name,
      approved: 0,
      pending: 0,
      rejected: 0,
    };
    entry[inv.final_status] += 1;
    map.set(inv.customer_name, entry);
  });
  return Array.from(map.values());
}

export function pendingAgeDays(inv: Invoice) {
  if (inv.final_status !== "pending") return 0;
  const created = new Date(inv.created_at).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.ceil((Date.now() - created) / 86400000));
}
