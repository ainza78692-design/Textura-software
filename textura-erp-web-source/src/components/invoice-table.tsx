import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronRight, Loader2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteInvoice, deleteInvoices } from "@/api/invoices";
import { StatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Invoice } from "@/types/api";

const actionColumnClass =
  "sticky right-0 z-20 w-[132px] min-w-[132px] border-l border-border/70 bg-card/98 pl-3 pr-5 text-right shadow-[-18px_0_24px_-24px_oklch(0.2_0.04_240_/_0.36)]";

type PendingDelete =
  | { type: "one"; invoice: Invoice }
  | { type: "many"; ids: string[]; count: number };

function pendingAgeDays(inv: Invoice) {
  if (inv.final_status !== "pending") return 0;
  const created = new Date(inv.created_at).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.ceil((Date.now() - created) / 86400000));
}

function PendingDocumentsCell({ invoice }: { invoice: Invoice }) {
  const documents = invoice.pending_documents ?? [];

  if (!documents.length) {
    return (
      <span className="inline-flex rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success ring-1 ring-success/20">
        All verified
      </span>
    );
  }

  return (
    <div className="flex max-w-[260px] flex-wrap gap-1">
      {documents.map((doc) => (
        <Badge
          key={`${doc.document_code}-${doc.status}`}
          variant="outline"
          className={
            doc.status === "rejected"
              ? "border-destructive/25 bg-destructive/10 text-destructive"
              : "border-warning/25 bg-warning/10 text-warning"
          }
        >
          {doc.label}
        </Badge>
      ))}
    </div>
  );
}

export function InvoiceTable({ data, dense = false }: { data: Invoice[]; dense?: boolean }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const selectable = !dense;
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visibleIds = data.map((invoice) => invoice.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));

  const deleteOneMutation = useMutation({
    mutationFn: deleteInvoice,
    onSuccess: () => {
      setSelected([]);
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Invoice deleted");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Unable to delete invoice"),
  });

  const deleteManyMutation = useMutation({
    mutationFn: deleteInvoices,
    onSuccess: ({ deleted }) => {
      setSelected([]);
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(`${deleted} invoice${deleted === 1 ? "" : "s"} deleted`);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Unable to delete selected invoices"),
  });

  const deleting = deleteOneMutation.isPending || deleteManyMutation.isPending;

  function toggleSelected(id: string, checked: boolean) {
    setSelected((current) =>
      checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id),
    );
  }

  function toggleAllVisible(checked: boolean) {
    setSelected((current) => {
      if (!checked) return current.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...current, ...visibleIds]));
    });
  }

  function deleteOne(invoice: Invoice) {
    setPendingDelete({ type: "one", invoice });
  }

  function deleteSelected() {
    if (!selected.length) return;
    setPendingDelete({ type: "many", ids: selected, count: selected.length });
  }

  function confirmDelete() {
    if (!pendingDelete) return;

    if (pendingDelete.type === "one") {
      deleteOneMutation.mutate(pendingDelete.invoice.id);
    } else {
      deleteManyMutation.mutate(pendingDelete.ids);
    }

    setPendingDelete(null);
  }

  return (
    <>
      <div className="surface-panel w-full min-w-0 max-w-full overflow-hidden rounded-2xl">
        {selectable && selected.length > 0 && (
          <div className="flex items-center justify-between border-b border-border/70 bg-primary/8 px-5 py-3">
            <div className="text-sm font-semibold text-primary">{selected.length} selected</div>
            <Button variant="destructive" size="sm" onClick={deleteSelected} disabled={deleting}>
              {deleteManyMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete selected
            </Button>
          </div>
        )}
        <div className="max-h-[640px] max-w-full overflow-auto overscroll-contain">
          <Table className="min-w-[1600px]">
            <TableHeader className="sticky top-0 z-10 bg-card/92 backdrop-blur-xl">
              <TableRow className="hover:bg-transparent">
                {selectable && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(checked) => toggleAllVisible(Boolean(checked))}
                    />
                  </TableHead>
                )}
                <TableHead className="w-[300px] min-w-[300px]">Customer</TableHead>
                <TableHead className="w-[160px] min-w-[160px]">Invoice #</TableHead>
                <TableHead className="w-[140px] min-w-[140px]">Count</TableHead>
                <TableHead className="w-[140px] min-w-[140px]">Status</TableHead>
                <TableHead className="w-[270px] min-w-[270px]">Pending Documents</TableHead>
                {!dense && <TableHead className="w-[145px] min-w-[145px]">Pending Since</TableHead>}
                {!dense && <TableHead className="w-[175px] min-w-[175px]">Updated By</TableHead>}
                <TableHead className="w-[150px] min-w-[150px]">Last Updated</TableHead>
                {!dense && <TableHead className="w-[130px] min-w-[130px]">Remark</TableHead>}
                <TableHead className={actionColumnClass}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={selectable ? 11 : 10}
                    className="h-36 text-center text-sm font-medium text-muted-foreground"
                  >
                    No invoices match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((inv) => {
                  const pendingDays = pendingAgeDays(inv);
                  return (
                    <TableRow
                      key={inv.id}
                      className="group transition-colors hover:bg-accent/20 focus-within:bg-accent/20"
                    >
                      {selectable && (
                        <TableCell>
                          <Checkbox
                            checked={selectedSet.has(inv.id)}
                            onCheckedChange={(checked) => toggleSelected(inv.id, Boolean(checked))}
                          />
                        </TableCell>
                      )}
                      <TableCell className="w-[300px] min-w-[300px] font-semibold">
                        <Link
                          to="/invoices/$invoiceId"
                          params={{ invoiceId: inv.id }}
                          className="inline-flex max-w-[240px] items-center gap-1.5 rounded-lg text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="truncate">{inv.customer_name}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="w-[160px] min-w-[160px]">
                        <Link
                          to="/invoices/$invoiceId"
                          params={{ invoiceId: inv.id }}
                          className="inline-flex rounded-full bg-muted/60 px-2.5 py-1 font-mono text-[0.72rem] font-semibold tracking-normal text-primary ring-1 ring-border/70 transition-colors hover:bg-primary/10 hover:ring-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {inv.invoice_number}
                        </Link>
                      </TableCell>
                      <TableCell className="w-[140px] min-w-[140px] text-muted-foreground">
                        {inv.count_construction ?? "-"}
                      </TableCell>
                      <TableCell className="w-[140px] min-w-[140px]">
                        <StatusBadge status={inv.final_status} />
                      </TableCell>
                      <TableCell className="w-[270px] min-w-[270px]">
                        <PendingDocumentsCell invoice={inv} />
                      </TableCell>
                      {!dense && (
                        <TableCell className="w-[145px] min-w-[145px]">
                          {pendingDays > 0 ? (
                            <span className="font-semibold text-warning">{pendingDays}d</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}
                      {!dense && (
                        <TableCell className="w-[175px] min-w-[175px] text-muted-foreground">
                          {inv.updated_by_name ?? inv.created_by_name ?? "-"}
                        </TableCell>
                      )}
                      <TableCell className="w-[150px] min-w-[150px] font-mono text-[0.72rem] text-muted-foreground">
                        {format(new Date(inv.updated_at), "MMM d, HH:mm")}
                      </TableCell>
                      {!dense && (
                        <TableCell className="w-[130px] min-w-[130px] max-w-[130px] truncate text-muted-foreground">
                          {inv.remark ?? "-"}
                        </TableCell>
                      )}
                      <TableCell
                        className={`${actionColumnClass} z-10 transition-colors group-hover:bg-card`}
                      >
                        <div className="flex justify-end gap-1.5">
                          {selectable && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive opacity-70 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                              disabled={deleting}
                              onClick={() => deleteOne(inv)}
                              title="Delete invoice"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="rounded-full px-2.5 text-primary hover:bg-primary/10 hover:text-primary"
                          >
                            <Link to="/invoices/$invoiceId" params={{ invoiceId: inv.id }}>
                              Open <ChevronRight className="ml-1 h-3 w-3" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.type === "one"
                ? `Delete invoice ${pendingDelete.invoice.invoice_number}? This cannot be undone.`
                : `Delete ${pendingDelete?.count ?? 0} selected invoice${
                    pendingDelete?.count === 1 ? "" : "s"
                  }? This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
