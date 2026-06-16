import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area } from "recharts";
import { TrendingDown, TrendingUp, Clock, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { listInvoices } from "@/api/invoices";
import { clientApprovalData, pendingAgeDays, statusCounts } from "@/lib/invoice-analytics";

export const Route = createFileRoute("/reports")({ component: Reports });

function Reports() {
  const { data } = useQuery({
    queryKey: ["invoices", "reports"],
    queryFn: () => listInvoices({ limit: 100 }),
  });

  const invoices = data?.invoices ?? [];
  const counts = statusCounts(invoices);
  const closed = counts.approved + counts.rejected;
  const approvalRate = closed ? Math.round((counts.approved / closed) * 1000) / 10 : 0;
  const rejectionRate = closed ? Math.round((counts.rejected / closed) * 1000) / 10 : 0;
  const aged = invoices.filter((i) => pendingAgeDays(i) > 14).length;
  const clientData = clientApprovalData(invoices);

  const trend = Array.from({ length: 12 }).map((_, i) => {
    const month = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][i];
    const monthInvoices = invoices.filter((inv) => new Date(inv.created_at).getMonth() === i);
    return {
      month,
      approved: monthInvoices.filter((inv) => inv.final_status === "approved").length,
      rejected: monthInvoices.filter((inv) => inv.final_status === "rejected").length,
    };
  });

  const aging = [
    { bucket: "0-3d", count: invoices.filter((i) => pendingAgeDays(i) >= 0 && pendingAgeDays(i) <= 3 && i.final_status === "pending").length },
    { bucket: "4-7d", count: invoices.filter((i) => pendingAgeDays(i) >= 4 && pendingAgeDays(i) <= 7).length },
    { bucket: "8-14d", count: invoices.filter((i) => pendingAgeDays(i) >= 8 && pendingAgeDays(i) <= 14).length },
    { bucket: "15-30d", count: invoices.filter((i) => pendingAgeDays(i) >= 15 && pendingAgeDays(i) <= 30).length },
    { bucket: "30d+", count: invoices.filter((i) => pendingAgeDays(i) > 30).length },
  ];

  const reasons = [
    { reason: "Rejected", count: counts.rejected },
    { reason: "Pending", count: counts.pending },
    { reason: "Approved", count: counts.approved },
  ];

  return (
    <div>
      <PageHeader title="Reports & Analytics" description="Operational insights across approvals, rejections, and aging." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Approval Rate" value={`${approvalRate}%`} tone="success" icon={TrendingUp} />
        <StatCard label="Rejection Rate" value={`${rejectionRate}%`} tone="destructive" icon={TrendingDown} />
        <StatCard label="Avg Cycle Time" value="Live" delta="Tracked from backend timestamps" tone="info" icon={Clock} />
        <StatCard label="Aged > 14d" value={aged} tone="warning" icon={AlertTriangle} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-base">Approval vs Rejection Trend</CardTitle>
            <CardDescription>Created invoices by calendar month.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--success)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--success)" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--destructive)" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="approved" stroke="var(--success)" fill="url(#ga)" strokeWidth={2} />
                <Area type="monotone" dataKey="rejected" stroke="var(--destructive)" fill="url(#gr)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader><CardTitle className="text-base">Pending Aging Buckets</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer>
              <BarChart data={aging}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="bucket" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="var(--warning)" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader><CardTitle className="text-base">Client-wise Approvals</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer>
              <BarChart data={clientData} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={120} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="approved" fill="var(--success)" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader><CardTitle className="text-base">Status Distribution</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer>
              <LineChart data={reasons}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="reason" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="count" stroke="var(--destructive)" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
