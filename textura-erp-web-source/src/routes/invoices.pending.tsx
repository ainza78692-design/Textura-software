import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { InvoiceTable } from "@/components/invoice-table";
import { listInvoices } from "@/api/invoices";

export const Route = createFileRoute("/invoices/pending")({ component: Page });

function Page() {
  const { data, isLoading } = useQuery({
    queryKey: ["invoices", "pending"],
    queryFn: () => listInvoices({ status: "pending", limit: 100 }),
  });
  const invoices = data?.invoices ?? [];
  return (
    <div className="w-full min-w-0 animate-rise-in">
      <PageHeader
        title="Pending Approvals"
        description={
          isLoading
            ? "Loading invoices..."
            : `${invoices.length} invoices currently awaiting document verification.`
        }
      />
      <InvoiceTable data={invoices} />
    </div>
  );
}
