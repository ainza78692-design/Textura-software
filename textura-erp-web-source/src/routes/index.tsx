import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Download,
  Activity,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InvoiceTable } from "@/components/invoice-table";
import { exportInvoices, listInvoices } from "@/api/invoices";
import { clientApprovalData, pendingAgeDays, statusCounts } from "@/lib/invoice-analytics";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { DocStatus } from "@/types/api";

export const Route = createFileRoute("/")({ component: Dashboard });

const workflowStatuses = ["approved", "pending", "rejected"] as const;
const CLIENT_WORKLOAD_LIMIT = 5;

type ClientWorkloadRow = {
  name: string;
  approved: number;
  pending: number;
  rejected: number;
  total: number;
  includedClients?: number;
  isOther?: boolean;
};

const statusMeta = {
  approved: {
    label: "Approved",
    color: "var(--success)",
    softClass: "bg-success/10 text-success ring-success/20",
    href: "/invoices/approved",
  },
  pending: {
    label: "Pending",
    color: "var(--warning)",
    softClass: "bg-warning/10 text-warning ring-warning/20",
    href: "/invoices/pending",
  },
  rejected: {
    label: "Rejected",
    color: "var(--destructive)",
    softClass: "bg-destructive/10 text-destructive ring-destructive/20",
    href: "/invoices/rejected",
  },
} as const;

function numberLabel(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function ChartSkeleton() {
  return (
    <div className="flex h-full flex-col justify-end gap-3">
      {[72, 54, 86, 62, 44].map((width) => (
        <div
          key={width}
          className="h-8 animate-pulse rounded-lg bg-muted/70"
          style={{ width: `${width}%` }}
        />
      ))}
    </div>
  );
}

function EmptyChartState({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/25 px-6 text-center">
      <Activity className="mb-3 h-8 w-8 text-muted-foreground/70" />
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
        Add or import invoices and the dashboard will build this view automatically.
      </p>
    </div>
  );
}

function SnapshotTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "info";
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    info: "text-info",
  }[tone];

  return (
    <div className="rounded-xl border border-border/70 bg-background/45 p-3 shadow-sm">
      <div className="text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className={`mt-2 text-xl font-bold tracking-tight tabular-nums ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function compactName(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

function statusPercent(value: number, total: number) {
  if (!total || value <= 0) return 0;
  return Math.max(5, (value / total) * 100);
}

function ClientWorkloadGraph({ data }: { data: ClientWorkloadRow[] }) {
  const maxTotal = Math.max(1, ...data.map((client) => client.total));
  return (
    <div className="space-y-2.5">
      {data.map((client) => {
        const volumePercent = Math.max(8, (client.total / maxTotal) * 100);
        return (
          <div
            key={client.name}
            className="rounded-xl border border-border/65 bg-background/45 p-3 transition-all hover:border-primary/25 hover:bg-accent/35"
          >
            <div className="grid gap-3 md:grid-cols-[minmax(170px,250px)_1fr_auto] md:items-center">
              <div className="min-w-0">
                <div
                  className="truncate text-sm font-bold tracking-tight text-foreground"
                  title={client.name}
                >
                  {compactName(client.name)}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.68rem] font-semibold text-muted-foreground">
                  {workflowStatuses.map((status) => (
                    <span key={status} className="inline-flex items-center gap-1">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: statusMeta[status].color }}
                      />
                      {client[status]}
                    </span>
                  ))}
                  {client.isOther && client.includedClients ? (
                    <span className="rounded-full bg-muted px-1.5 py-0.5">
                      {client.includedClients} clients
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0">
                <div className="mb-1.5 flex items-center justify-between text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <span>Volume</span>
                  <span>{Math.round(volumePercent)}%</span>
                </div>
                <div className="h-3.5 overflow-hidden rounded-full bg-muted/80 shadow-inner ring-1 ring-border/60">
                  <div
                    className="flex h-full overflow-hidden rounded-full transition-all duration-500"
                    style={{ width: `${volumePercent}%` }}
                  >
                    {workflowStatuses.map((status) => (
                      <span
                        key={status}
                        className="h-full"
                        style={{
                          width: `${statusPercent(client[status], client.total)}%`,
                          backgroundColor: statusMeta[status].color,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-baseline justify-between gap-2 rounded-lg bg-muted/35 px-3 py-2 md:block md:min-w-16 md:text-center">
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground md:block">
                  Total
                </span>
                <span className="text-lg font-bold tracking-tight text-foreground">
                  {numberLabel(client.total)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function compactClientWorkload(clients: ClientWorkloadRow[]) {
  const topClients = clients.slice(0, CLIENT_WORKLOAD_LIMIT);
  const remainingClients = clients.slice(CLIENT_WORKLOAD_LIMIT);

  if (!remainingClients.length) return topClients;

  const otherClients = remainingClients.reduce<ClientWorkloadRow>(
    (summary, client) => ({
      ...summary,
      approved: summary.approved + client.approved,
      pending: summary.pending + client.pending,
      rejected: summary.rejected + client.rejected,
      total: summary.total + client.total,
    }),
    {
      name: "Other clients",
      approved: 0,
      pending: 0,
      rejected: 0,
      total: 0,
      includedClients: remainingClients.length,
      isOther: true,
    },
  );

  return [...topClients, otherClients];
}

function Dashboard() {
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportFilters, setExportFilters] = useState({
    q: "",
    status: "all",
    customer: "all",
    dateFrom: "",
    dateTo: "",
  });
  const { data, isLoading } = useQuery({
    queryKey: ["invoices", "dashboard"],
    queryFn: () => listInvoices({ limit: 100 }),
  });

  const invoices = useMemo(() => data?.invoices ?? [], [data?.invoices]);
  const counts = statusCounts(invoices);
  const statusRows = workflowStatuses.map((status) => ({
    status,
    value: counts[status],
    percent: counts.total ? Math.round((counts[status] / counts.total) * 100) : 0,
    ...statusMeta[status],
  }));
  const sortedClientData = useMemo<ClientWorkloadRow[]>(
    () =>
      clientApprovalData(invoices)
        .map((client) => ({
          ...client,
          total: client.approved + client.pending + client.rejected,
        }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    [invoices],
  );
  const clientWorkloadData = useMemo(
    () => compactClientWorkload(sortedClientData),
    [sortedClientData],
  );
  const remainingClientCount = Math.max(0, sortedClientData.length - CLIENT_WORKLOAD_LIMIT);
  const pending = invoices.filter((i) => i.final_status === "pending").slice(0, 6);
  const oldestPending = Math.max(0, ...invoices.map((i) => pendingAgeDays(i)));
  const closed = counts.approved + counts.rejected;
  const approvalRate = closed ? Math.round((counts.approved / closed) * 100) : 0;
  const pendingShare = counts.total ? Math.round((counts.pending / counts.total) * 100) : 0;
  const customers = useMemo(
    () => Array.from(new Set(invoices.map((i) => i.customer_name))).sort(),
    [invoices],
  );

  async function downloadExport() {
    setExportBusy(true);
    try {
      const blob = await exportInvoices({
        q: exportFilters.q || undefined,
        status: exportFilters.status === "all" ? undefined : (exportFilters.status as DocStatus),
        customer: exportFilters.customer === "all" ? undefined : exportFilters.customer,
        dateFrom: exportFilters.dateFrom || undefined,
        dateTo: exportFilters.dateTo || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportOpen(false);
      toast.success("Export downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to export invoices");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className="w-full min-w-0 animate-rise-in">
      <PageHeader
        title="Dashboard"
        description="A live command surface for invoice movement, client workload, and approval health."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button asChild size="sm">
              <Link to="/invoices/entry">
                <Plus className="mr-2 h-4 w-4" />
                New Invoice
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Total invoices"
          value={isLoading ? "..." : numberLabel(counts.total)}
          icon={FileText}
        />
        <StatCard
          label="Pending"
          value={isLoading ? "..." : numberLabel(counts.pending)}
          tone="warning"
          icon={Clock}
          href="/invoices/pending"
        />
        <StatCard
          label="Approved"
          value={isLoading ? "..." : numberLabel(counts.approved)}
          tone="success"
          icon={CheckCircle2}
          href="/invoices/approved"
        />
        <StatCard
          label="Rejected"
          value={isLoading ? "..." : numberLabel(counts.rejected)}
          tone="destructive"
          icon={XCircle}
          href="/invoices/rejected"
        />
        <StatCard
          label="Pending Since"
          value={`${oldestPending}d`}
          delta="Oldest open invoice"
          tone="info"
          icon={Activity}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="interactive-lift overflow-hidden shadow-soft">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Workflow Mix</CardTitle>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Status split across the latest invoice set.
                </p>
              </div>
              <div className="rounded-full bg-primary/10 p-2 text-primary ring-1 ring-primary/15">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {isLoading ? (
              <div className="h-[220px]">
                <ChartSkeleton />
              </div>
            ) : counts.total === 0 ? (
              <div className="h-[220px]">
                <EmptyChartState title="No invoice status yet" />
              </div>
            ) : (
              <>
                <div className="flex h-4 overflow-hidden rounded-full bg-muted shadow-inner ring-1 ring-border/60">
                  {statusRows.map((row) => (
                    <span
                      key={row.status}
                      className="h-full transition-all duration-500"
                      style={{ width: `${row.percent}%`, backgroundColor: row.color }}
                      title={`${row.label}: ${row.percent}%`}
                    />
                  ))}
                </div>
                <div className="space-y-3">
                  {statusRows.map((row) => (
                    <Link
                      key={row.status}
                      to={row.href}
                      className="group flex items-center justify-between rounded-xl border border-border/70 bg-background/45 p-3 transition-all hover:border-primary/30 hover:bg-accent/70"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${row.softClass}`}
                        >
                          {row.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {row.percent}% of total
                        </span>
                      </div>
                      <span className="text-lg font-bold tracking-tight text-foreground group-hover:text-primary">
                        {numberLabel(row.value)}
                      </span>
                    </Link>
                  ))}
                </div>
                <div className="rounded-xl bg-primary/10 px-4 py-3 ring-1 ring-primary/15">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                    Approval rate
                  </div>
                  <div className="mt-1 flex items-end gap-2">
                    <span className="text-3xl font-bold tracking-tight">{approvalRate}%</span>
                    <span className="pb-1 text-xs text-muted-foreground">
                      of closed invoices approved
                    </span>
                  </div>
                </div>
                <div className="border-t border-border/70 pt-4">
                  <div className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Approval Snapshot
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <SnapshotTile
                      label="Pending share"
                      value={`${pendingShare}%`}
                      tone={pendingShare > 0 ? "warning" : "success"}
                    />
                    <SnapshotTile label="Closed invoices" value={numberLabel(closed)} />
                    <SnapshotTile
                      label="Oldest pending"
                      value={`${oldestPending}d`}
                      tone={oldestPending > 0 ? "warning" : "success"}
                    />
                    <SnapshotTile
                      label="Total clients"
                      value={numberLabel(customers.length)}
                      tone="info"
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="interactive-lift shadow-soft lg:col-span-2">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">Client Workload</CardTitle>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Top {CLIENT_WORKLOAD_LIMIT} clients by invoice volume, with the rest grouped.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs font-semibold text-muted-foreground">
                {workflowStatuses.map((status) => (
                  <span key={status} className="flex items-center gap-1.5 capitalize">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: statusMeta[status].color }}
                    />
                    {status}
                  </span>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[260px]">
                <ChartSkeleton />
              </div>
            ) : clientWorkloadData.length === 0 ? (
              <div className="h-[260px]">
                <EmptyChartState title="No client workload yet" />
              </div>
            ) : (
              <>
                <ClientWorkloadGraph data={clientWorkloadData} />
                <div className="mt-4 flex flex-col gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    {remainingClientCount > 0
                      ? `Includes ${remainingClientCount} more client${remainingClientCount === 1 ? "" : "s"} in Other clients.`
                      : "All active clients are shown."}
                  </span>
                  <Button asChild variant="link" size="sm" className="h-auto justify-start p-0">
                    <Link to="/search">View all clients</Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Recent Pending Invoices
          </h2>
          <Button asChild variant="link" size="sm">
            <Link to="/invoices/pending">View all</Link>
          </Button>
        </div>
        <InvoiceTable data={pending} dense />
      </div>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Invoices</DialogTitle>
            <DialogDescription>
              Download an Excel-compatible file using status, client, date, and search filters.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Search</Label>
              <Input
                value={exportFilters.q}
                onChange={(event) =>
                  setExportFilters((current) => ({ ...current, q: event.target.value }))
                }
                placeholder="Example: prime fabric grs pending"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={exportFilters.status}
                  onValueChange={(value) =>
                    setExportFilters((current) => ({ ...current, status: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select
                  value={exportFilters.customer}
                  onValueChange={(value) =>
                    setExportFilters((current) => ({ ...current, customer: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All clients</SelectItem>
                    {customers.map((customer) => (
                      <SelectItem key={customer} value={customer}>
                        {customer}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>From Date</Label>
                <Input
                  type="date"
                  value={exportFilters.dateFrom}
                  onChange={(event) =>
                    setExportFilters((current) => ({ ...current, dateFrom: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>To Date</Label>
                <Input
                  type="date"
                  value={exportFilters.dateTo}
                  onChange={(event) =>
                    setExportFilters((current) => ({ ...current, dateTo: event.target.value }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={downloadExport} disabled={exportBusy}>
              <Download className="mr-2 h-4 w-4" />
              {exportBusy ? "Exporting..." : "Download Excel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
