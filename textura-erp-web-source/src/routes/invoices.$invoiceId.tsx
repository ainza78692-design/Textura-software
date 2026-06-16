import { createFileRoute } from "@tanstack/react-router";
import { InvoiceEntry } from "./invoices.entry";

export const Route = createFileRoute("/invoices/$invoiceId")({
  component: InvoiceDetailsPage,
});

function InvoiceDetailsPage() {
  const { invoiceId } = Route.useParams();
  return <InvoiceEntry invoiceId={invoiceId} />;
}
