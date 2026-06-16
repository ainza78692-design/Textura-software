import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search as SearchIcon, X, Filter } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { InvoiceTable } from "@/components/invoice-table";
import { listInvoices } from "@/api/invoices";
import type { DocStatus, DocumentCode } from "@/types/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  component: SearchPage,
});

const documentOptions: { label: string; value: DocumentCode }[] = [
  { label: "E-way Bill", value: "eway_bill" },
  { label: "GRS", value: "grs" },
  { label: "PO", value: "po" },
  { label: "TC", value: "tc" },
];

function SearchPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [q, setQ] = useState(search.q);
  const [statuses, setStatuses] = useState<DocStatus[]>([]);
  const [customer, setCustomer] = useState<string>("all");
  const [documents, setDocuments] = useState<DocumentCode[]>([]);
  const [chips, setChips] = useState<string[]>(search.q ? [search.q] : []);

  const activeQuery = chips.at(-1) ?? q;
  const queryStatus = statuses.length === 1 ? statuses[0] : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", "search", activeQuery, queryStatus, customer],
    queryFn: () =>
      listInvoices({
        q: activeQuery || undefined,
        status: queryStatus,
        customer: customer === "all" ? undefined : customer,
        limit: 100,
      }),
  });

  const { data: customerData } = useQuery({
    queryKey: ["invoices", "customer-filter-options"],
    queryFn: () => listInvoices({ limit: 100 }),
  });

  const allInvoices = data?.invoices ?? [];
  const statusRows =
    statuses.length > 1
      ? allInvoices.filter((invoice) => statuses.includes(invoice.final_status))
      : allInvoices;
  const dataRows = documents.length
    ? statusRows.filter((invoice) =>
        (invoice.pending_documents ?? []).some((doc) => documents.includes(doc.document_code)),
      )
    : statusRows;

  const customers = useMemo(
    () => Array.from(new Set((customerData?.invoices ?? []).map((i) => i.customer_name))).sort(),
    [customerData],
  );

  const toggleStatus = (status: DocStatus) =>
    setStatuses((current) =>
      current.includes(status) ? current.filter((item) => item !== status) : [...current, status],
    );

  const toggleDocument = (document: DocumentCode) =>
    setDocuments((current) =>
      current.includes(document)
        ? current.filter((item) => item !== document)
        : [...current, document],
    );

  const runSearch = (text: string) => {
    const value = text.trim();
    if (!value) return;
    setChips([value]);
    setQ("");
    navigate({ to: "/search", search: { q: value } });
  };

  const resetSearch = () => {
    setStatuses([]);
    setCustomer("all");
    setDocuments([]);
    setChips([]);
    setQ("");
    navigate({ to: "/search", search: { q: "" } });
  };

  return (
    <div className="w-full min-w-0 animate-rise-in">
      <PageHeader
        title="Global Search"
        description="Search invoices, parties, statuses, document names, and pending or approved document states."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="interactive-lift h-fit lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4 text-primary" />
              Optional Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Status
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {(["approved", "pending", "rejected"] as DocStatus[]).map((status) => (
                  <button
                    key={status}
                    onClick={() => toggleStatus(status)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      statuses.includes(status)
                        ? status === "approved"
                          ? "status-approved"
                          : status === "rejected"
                            ? "status-rejected"
                            : "status-pending"
                        : "border-border/70 bg-muted/20 text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <Label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Customer
              </Label>
              <Select value={customer} onValueChange={setCustomer}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All customers</SelectItem>
                  {customers.map((customerName) => (
                    <SelectItem key={customerName} value={customerName}>
                      {customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div>
              <Label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Pending Document
              </Label>
              <div className="space-y-2">
                {documentOptions.map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground/85 transition-colors hover:bg-accent"
                  >
                    <Checkbox
                      checked={documents.includes(option.value)}
                      onCheckedChange={() => toggleDocument(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <Separator />

            <Button variant="outline" className="w-full" onClick={resetSearch}>
              Reset search
            </Button>
          </CardContent>
        </Card>

        <div className="min-w-0">
          <div className="surface-panel relative rounded-2xl p-2">
            <SearchIcon className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setChips([]);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") runSearch(q);
              }}
              placeholder="Try: approved, pending, customer name, invoice number, count, TC pending"
              className="h-12 border-transparent bg-transparent pl-10 text-sm shadow-none focus-visible:bg-background/70"
            />
          </div>

          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Search:</span>
              {chips.map((chip) => (
                <Badge key={chip} variant="secondary" className="gap-1 pr-1">
                  {chip}
                  <button
                    onClick={() => {
                      setChips([]);
                      navigate({ to: "/search", search: { q: "" } });
                    }}
                    className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <div className="mb-3 mt-5 flex items-center justify-between">
            <div className="text-sm font-semibold text-muted-foreground">
              {isLoading ? "Loading..." : `${dataRows.length} results`}
            </div>
          </div>
          <InvoiceTable data={dataRows} />
        </div>
      </div>
    </div>
  );
}
