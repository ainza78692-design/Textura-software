import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  CalendarIcon,
  Save,
    CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Loader2,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import {
  bulkCreateInvoices,
  createInvoice,
  getInvoice,
  listInvoices,
  updateDocumentStatus,
  updateInvoice,
} from "@/api/invoices";
import type { DocStatus, DocumentCode, Invoice, InvoiceInput } from "@/types/api";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/invoices/entry")({ component: InvoiceEntry });

// Required documents - these affect final invoice approval status
const REQUIRED_DOCS: { code: DocumentCode; label: string }[] = [
  { code: "invoice", label: "Invoice" },
  { code: "eway_bill", label: "E-way Bill" },
  { code: "grs", label: "GRS" },
  { code: "po", label: "PO" },
  { code: "count_construction", label: "Count Construction" },
  { code: "mbs", label: "MBS" },
  { code: "tc", label: "TC" },
];

// Optional documents - these do NOT affect final invoice approval status
const OPTIONAL_DOCS: { code: DocumentCode; label: string }[] = [
  { code: "inditex", label: "Inditex" },
  { code: "textile_genesis", label: "Textile Genesis" },
];
const REQUIRED_WORKFLOW_FIELDS = [
  ["invoiceDoc", "invoice"],
  ["ewayBillDoc", "eway_bill"],
  ["grsDoc", "grs"],
  ["poDoc", "po"],
  ["countConstructionDoc", "count_construction"],
  ["mbsDoc", "mbs"],
  ["tcDoc", "tc"],
] as const;

const ALL_DOCS = [...REQUIRED_DOCS, ...OPTIONAL_DOCS];

const emptyDocs = Object.fromEntries(ALL_DOCS.map((doc) => [doc.code, "pending"])) as Record<
  DocumentCode,
  DocStatus
>;

const FIELD_ALIASES = {
  invoiceDate: ["date", "invoice date", "bill date"],
  invoiceNumber: ["bill no", "bill number", "invoice no", "invoice number"],
  customerName: ["name of party", "party name", "customer name", "client name"],
  quantityMeters: ["quantity", "qty", "meters", "meter", "quantity meters", "quantity in meters"],
  ewayBill: [
    "e way no",
    "e way no.",
    "eway no",
    "e way number",
    "eway number",
    "ewb no",
    "ewb number",
    "e-way bill",
    "eway bill",
    "eway bill number",
    "e-way bill no",
  ],
  inditex: ["inditex", "inditex value"],
  textileGenesis: ["textile genesis", "textile genesis value", "textile_genesis"],
  invoiceDoc: ["invoice"],
  ewayBillDoc: ["e-way bill", "eway bill"],
  grsDoc: ["grs"],
  poDoc: ["po"],
  countConstructionDoc: ["count construction"],
  mbsDoc: ["mbs"],
  tcDoc: ["tc"],
} as const;

type ExcelField = keyof typeof FIELD_ALIASES;
type ExcelRow = unknown[];
type ImportResult = { createdCount: number; failedCount: number; failedPreview: string[] };

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function cellText(value: unknown) {
  return String(value ?? "").trim();
}

function toIsoDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  const text = cellText(value);
  if (!text) return null;

  const match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    const year = yyyy.length === 2 ? `20${yyyy}` : yyyy;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : format(parsed, "yyyy-MM-dd");
}

function headerMatches(field: ExcelField, header: string, aliases: string[]) {
  if (aliases.includes(header)) return true;
  if (field === "ewayBill") return header.includes("eway") || header.includes("ewb");
  if (field === "invoiceNumber")
    return (
      header === "billno" ||
      header === "billnumber" ||
      (header.includes("invoice") && (header.includes("no") || header.includes("number")))
    );
  if (field === "customerName")
    return header.includes("party") || header.includes("customer") || header.includes("client");
  if (field === "quantityMeters")
    return header === "quantity" || header === "qty" || header.includes("meter");
  if (field === "invoiceDate")
    return header === "date" || header === "billdate" || header === "invoicedate";
  if (field === "inditex") return header.includes("inditex");
  if (field === "textileGenesis")
    return header.includes("textile") && header.includes("genesis");
  return false;
}

function detectHeader(rows: ExcelRow[]) {
  let best: any = null;

  rows.slice(0, 50).forEach((row, rowIndex) => {
    const normalized = row.map(normalizeHeader);
    const columns: Partial<Record<ExcelField, number>> = {};
    let score = 0;

    (Object.keys(FIELD_ALIASES) as ExcelField[]).forEach((field) => {
      const aliases = FIELD_ALIASES[field].map(normalizeHeader);
      const columnIndex = normalized.findIndex(
        (header) => header && headerMatches(field, header, aliases),
      );
      if (columnIndex >= 0) {
        columns[field] = columnIndex;
        score += field === "invoiceNumber" || field === "customerName" ? 3 : 1;
      }
    });

    if (!best || score > best.score) best = { rowIndex, columns, score };
  });

  if (
    !best ||
    best.score < 6 ||
    best.columns.invoiceNumber == null ||
    best.columns.customerName == null
  ) {
    throw new Error("Could not find Bill No and Name of Party columns in this Excel file.");
  }

  return best as {
    rowIndex: number;
    columns: Partial<Record<ExcelField, number>>;
    score: number;
  };
}

function parseInvoiceRows(rows: ExcelRow[]) {
  const header = detectHeader(rows);
  const invoices: InvoiceInput[] = [];

  for (const row of rows.slice(header.rowIndex + 1)) {
    const invoiceNumber = cellText(row[header.columns.invoiceNumber!]);
    const customerName = cellText(row[header.columns.customerName!]);
    if (!invoiceNumber || !customerName) continue;

    const invoiceDate =
      header.columns.invoiceDate == null ? null : toIsoDate(row[header.columns.invoiceDate]);
    const ewayBill =
      header.columns.ewayBill == null ? null : cellText(row[header.columns.ewayBill]);
    const inditex =
      header.columns.inditex == null ? null : cellText(row[header.columns.inditex]);
    const textileGenesis =
      header.columns.textileGenesis == null ? null : cellText(row[header.columns.textileGenesis]);
    const documentStatuses = Object.fromEntries(
      REQUIRED_WORKFLOW_FIELDS.map(([field, code]) => [
        code,
        header.columns[field] == null || !cellText(row[header.columns[field]]) ? "pending" : "approved",
      ]),
    ) as Partial<Record<DocumentCode, DocStatus>>;
    if (inditex) documentStatuses.inditex = "approved";
    if (textileGenesis) documentStatuses.textile_genesis = "approved";

    invoices.push({
      invoiceNumber,
      customerName,
      invoiceDate,
      ewayBill: ewayBill && ewayBill !== invoiceNumber ? ewayBill : null,
      quantityMeters:
        header.columns.quantityMeters == null ? null : cellText(row[header.columns.quantityMeters]),
      inditex: inditex || null,
      textileGenesis: textileGenesis || null,
      documentStatuses,
    });
  }

  return invoices.slice(0, 500);
}

export function InvoiceEntry({ invoiceId: invoiceIdProp }: { invoiceId?: string } = {}) {
  const params = useParams({ strict: false }) as { invoiceId?: string };
  const invoiceId = invoiceIdProp ?? params.invoiceId;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [docs, setDocs] = useState<Record<DocumentCode, DocStatus>>(emptyDocs);
  const [optionalDocData, setOptionalDocData] = useState<Record<string, boolean>>({
    inditex: false,
    textile_genesis: false,
  });
  const [form, setForm] = useState({
    customerName: "",
    invoiceNumber: "",
    ewayBill: "",
    quantityMeters: "",
    countConstruction: "",
    inditex: "",
    textileGenesis: "",
    remark: "",
  });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const existingInvoiceQuery = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => getInvoice(invoiceId!),
    enabled: Boolean(invoiceId),
  });

  const final = invoice?.final_status ?? "pending";
  const { data: existingInvoices } = useQuery({
    queryKey: ["invoices", "customer-suggestions"],
    queryFn: () => listInvoices({ limit: 100 }),
  });
  const customerSuggestions = Array.from(
    new Set((existingInvoices?.invoices ?? []).map((item) => item.customer_name).filter(Boolean)),
  );

  useEffect(() => {
    const loaded = existingInvoiceQuery.data?.invoice;
    if (!loaded) return;
    setInvoice(loaded);
    setForm({
      customerName: loaded.customer_name,
      invoiceNumber: loaded.invoice_number,
      ewayBill: loaded.eway_bill ?? "",
      quantityMeters: loaded.quantity_meters ?? "",
      countConstruction: loaded.count_construction ?? "",
      inditex: loaded.inditex ?? "",
      textileGenesis: loaded.textile_genesis ?? "",
      remark: loaded.remark ?? "",
    });
    setDate(loaded.invoice_date ? new Date(loaded.invoice_date) : undefined);
    setDocs({
      ...emptyDocs,
      ...Object.fromEntries((loaded.documents ?? []).map((doc) => [doc.document_code, doc.status])),
    });
    // Track which optional docs have data
    setOptionalDocData({
      inditex: Boolean(loaded.inditex),
      textile_genesis: Boolean(loaded.textile_genesis),
    });
  }, [existingInvoiceQuery.data]);

  function updateForm(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    // Update optional doc data tracking
    if (key === "inditex" || key === "textileGenesis") {
      const docKey = key === "inditex" ? "inditex" : "textile_genesis";
      setOptionalDocData((current) => ({ ...current, [docKey]: Boolean(value.trim()) }));
      setDocs((current) => ({
        ...current,
        [docKey]: value.trim() ? "approved" : "pending",
      }));
    }
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createInvoice({
        ...form,
        invoiceDate: date ? format(date, "yyyy-MM-dd") : null,
      }),
    onSuccess: ({ invoice }) => {
      setInvoice(invoice);
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: () =>
      updateInvoice(invoice!.id, {
        ...form,
        invoiceDate: date ? format(date, "yyyy-MM-dd") : null,
      }),
    onSuccess: ({ invoice }) => {
      setInvoice(invoice);
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["invoice", invoice.id] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({
      invoiceId,
      code,
      status,
    }: {
      invoiceId: string;
      code: DocumentCode;
      status: DocStatus;
    }) => updateDocumentStatus(invoiceId, code, status),
    onSuccess: ({ invoice }) => {
      setInvoice(invoice);
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: (invoices: InvoiceInput[]) => bulkCreateInvoices(invoices),
    onSuccess: ({ created, failed }) => {
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      const message = `${created.length} invoice${created.length === 1 ? "" : "s"} imported${failed.length ? `, ${failed.length} skipped` : ""}.`;
      setImportResult({
        createdCount: created.length,
        failedCount: failed.length,
        failedPreview: failed.slice(0, 3).map((row) => `${row.invoiceNumber}: ${row.reason}`),
      });
      if (created.length) toast.success("Excel import completed", { description: message });
      if (failed.length) {
        toast.warning("Some rows were skipped", {
          description: failed
            .slice(0, 3)
            .map((row) => `${row.invoiceNumber}: ${row.reason}`)
            .join(", "),
        });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to import Excel file");
    },
  });

  const busy =
    createMutation.isPending ||
    updateInvoiceMutation.isPending ||
    statusMutation.isPending;

  async function saveDraft() {
    if (!form.invoiceNumber.trim()) {
      toast.error("Invoice number is required");
      return;
    }
    if (!form.customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    try {
      const saved = invoice ?? (await createMutation.mutateAsync()).invoice;
      if (invoice) {
        await updateInvoiceMutation.mutateAsync();
      }
      const visibleDocCodes = new Set<DocumentCode>([
        ...REQUIRED_DOCS.map((doc) => doc.code),
        ...OPTIONAL_DOCS.filter((doc) => optionalDocData[doc.code]).map((doc) => doc.code),
      ]);
      for (const [code, status] of Object.entries(docs) as [DocumentCode, DocStatus][]) {
        if (!visibleDocCodes.has(code)) continue;
        await updateDocumentStatus(saved.id, code, status);
      }
      toast.success("Invoice saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save draft");
    }
  }

  function setStatus(code: DocumentCode, status: DocStatus) {
    setDocs((current) => ({ ...current, [code]: status }));
    if (invoice) {
      statusMutation.mutate({ invoiceId: invoice.id, code, status });
    }
  }

  async function importExcel(file: File | undefined) {
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      toast.error("Please upload an Excel file (.xls or .xlsx)");
      return;
    }

    try {
      setImportResult(null);
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, { header: 1, defval: "", raw: true });
      const invoices = parseInvoiceRows(rows);
      if (!invoices.length) {
        toast.error("No valid invoice rows found after the header row.");
        return;
      }
      await bulkImportMutation.mutateAsync(invoices);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to read Excel file");
    }
  }

  return (
    <div className="w-full min-w-0 animate-rise-in">
      <PageHeader
        title={invoiceId ? "Invoice Details" : "New Invoice Entry"}
        description="Capture invoice metadata and track each document through the approval workflow."
        actions={
          <>
            <Button variant="outline" onClick={saveDraft} disabled={busy}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              Save Invoice
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="interactive-lift xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Invoice Details</CardTitle>
            <CardDescription>
              All fields marked with * are required for final submission.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-7 rounded-2xl border border-dashed border-primary/25 bg-primary/6 p-4 md:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/10 p-2.5 text-primary ring-1 ring-primary/15">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold tracking-tight">Bulk Import Excel</div>
                    <div className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                      Imports Date, Bill No, Name of Party, Quantity, E-way Bill, Inditex, and Textile Genesis from the first
                      worksheet.
                    </div>
                  </div>
                </div>
                <div>
                  <Input
                    id="bulk-excel-upload"
                    type="file"
                    accept=".xls,.xlsx"
                    className="hidden"
                    disabled={bulkImportMutation.isPending}
                    onChange={(event) => {
                      void importExcel(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                  <Button asChild variant="outline" disabled={bulkImportMutation.isPending}>
                    <label htmlFor="bulk-excel-upload" className="cursor-pointer">
                      {bulkImportMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      Upload Excel
                    </label>
                  </Button>
                </div>
              </div>
              {importResult && (
                <div className="mt-4 rounded-2xl border border-success/25 bg-success/10 p-4 shadow-soft">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                      <div>
                        <div className="text-sm font-bold text-success">
                          {importResult.createdCount} invoice
                          {importResult.createdCount === 1 ? "" : "s"} imported
                          {importResult.failedCount ? `, ${importResult.failedCount} skipped` : ""}
                        </div>
                        <div className="mt-1 text-sm leading-6 text-muted-foreground">
                          Imported invoices are now available in Pending Approvals.
                        </div>
                        {importResult.failedPreview.length > 0 && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            Skipped rows: {importResult.failedPreview.join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm">
                        <Link to="/invoices/pending">Review Pending Invoices</Link>
                      </Button>
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        disabled={bulkImportMutation.isPending}
                      >
                        <label htmlFor="bulk-excel-upload" className="cursor-pointer">
                          Import Another File
                        </label>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mb-4 border-t border-border/70 pt-5">
              <div className="text-sm font-bold tracking-tight">Manual Entry</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Use this form for a single invoice or for edits after an import.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Customer Name *">
                <Input
                  list="customer-name-options"
                  value={form.customerName}
                  onChange={(e) => updateForm("customerName", e.target.value)}
                  placeholder="Enter party/customer name"
                />
                <datalist id="customer-name-options">
                  {customerSuggestions.map((customer) => (
                    <option key={customer} value={customer} />
                  ))}
                </datalist>
              </Field>
              <Field label="Invoice Number *">
                <Input
                  value={form.invoiceNumber}
                  onChange={(e) => updateForm("invoiceNumber", e.target.value)}
                  placeholder="INV-2026-04500"
                  disabled={Boolean(invoice)}
                />
              </Field>
              <Field label="E-way Bill">
                <Input
                  value={form.ewayBill}
                  onChange={(e) => updateForm("ewayBill", e.target.value)}
                  placeholder="EWB1234567890"
                />
              </Field>
              <Field label="Quantity (Meters)">
                <Input
                  value={form.quantityMeters}
                  onChange={(e) => updateForm("quantityMeters", e.target.value)}
                  placeholder="1029.00"
                />
              </Field>
              <Field label="Count Construction">
                <Input
                  value={form.countConstruction}
                  onChange={(e) => updateForm("countConstruction", e.target.value)}
                  placeholder="40s / 120x90"
                />
              </Field>
              <Field label="Invoice Date">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={setDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </Field>
              <Field label="Inditex (Optional)">
                <Input
                  value={form.inditex}
                  onChange={(e) => updateForm("inditex", e.target.value)}
                  placeholder="Enter Inditex value"
                />
              </Field>
              <Field label="Textile Genesis (Optional)">
                <Input
                  value={form.textileGenesis}
                  onChange={(e) => updateForm("textileGenesis", e.target.value)}
                  placeholder="Enter Textile Genesis value"
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Remark">
                  <Textarea
                    value={form.remark}
                    onChange={(e) => updateForm("remark", e.target.value)}
                    rows={3}
                    placeholder="Add internal notes for the approval team..."
                  />
                </Field>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card
            className={cn(
              "interactive-lift transition-all",
              invoice?.final_submitted_at && "ring-2 ring-primary/30",
            )}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-4 w-4 text-primary" />
                Final Status
              </CardTitle>
              <CardDescription>Auto-calculated by the backend on final submit.</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "flex items-center justify-center rounded-2xl border p-6 transition-all",
                  final === "approved" && "status-approved",
                  final === "rejected" && "status-rejected",
                  final === "pending" && "status-pending",
                )}
              >
                <div className="text-center">
                  {final === "approved" && <CheckCircle2 className="mx-auto h-10 w-10" />}
                  {final === "rejected" && <XCircle className="mx-auto h-10 w-10" />}
                  {final === "pending" && <Clock className="mx-auto h-10 w-10 animate-pulse" />}
                  <div className="mt-2 text-2xl font-bold tracking-tight capitalize">
                    Final {final}
                  </div>
                  <div className="mt-1 text-xs opacity-80">
                    {invoice
                      ? "Automatically updated on changes."
                      : "Pending until saved."}
                  </div>
                </div>
              </div>
              <Separator className="my-4" />
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between gap-4">
                  <span>Created by</span>
                  <span className="text-right font-semibold text-foreground">
                    {invoice?.created_by_name ?? user?.fullName ?? "-"}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Created on</span>
                  <span className="font-semibold text-foreground">
                    {invoice
                      ? format(new Date(invoice.created_at), "MMM d, yyyy")
                      : format(new Date(), "MMM d, yyyy")}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Workflow</span>
                  <span className="font-semibold text-foreground">Standard (7-doc + 2-optional)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="interactive-lift xl:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg">Document Verification Workflow</CardTitle>
            <CardDescription>
              <div className="space-y-2">
                <p>Required documents (all must be approved for invoice approval):</p>
                <p className="text-xs text-muted-foreground">All documents default to <StatusBadge status="pending" /> on creation. Update each
                status to advance the workflow.</p>
                <p className="text-xs font-semibold text-warning">Optional documents are displayed only if data exists in Excel. They do not affect the final approval status.</p>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Required Documents */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-foreground">Required Documents (7)</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {REQUIRED_DOCS.map((doc) => (
                    <DocCard
                      key={doc.code}
                      label={doc.label}
                      status={docs[doc.code]}
                      onChange={(s) => setStatus(doc.code, s)}
                    />
                  ))}
                </div>
              </div>

              {/* Optional Documents - Only show if data exists */}
              {Object.entries(optionalDocData).some(([_, hasData]) => hasData) && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Optional Documents</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {OPTIONAL_DOCS.map((doc) => {
                      const docKey = doc.code === "inditex" ? "inditex" : "textile_genesis";
                      const hasData = optionalDocData[docKey];
                      if (!hasData) return null;
                      return (
                        <DocCard
                          key={doc.code}
                          label={doc.label}
                          status={docs[doc.code]}
                          onChange={(s) => setStatus(doc.code, s)}
                          optional={true}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function DocCard({
  label,
  status,
  onChange,
  optional,
}: {
  label: string;
  status: DocStatus;
  onChange: (s: DocStatus) => void;
  optional?: boolean;
}) {
  return (
    <div className={cn("rounded-2xl border bg-background/50 p-4 shadow-sm transition-all hover:border-primary/25 hover:bg-card hover:shadow-soft", optional && "border-dashed border-warning/30 bg-warning/5")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-sm font-bold tracking-tight">{label}</div>
          {optional && <span className="text-xs font-semibold text-warning">Optional</span>}
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-1.5">
        {(["pending", "approved", "rejected"] as DocStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={cn(
              "rounded-lg border px-2 py-2 text-xs font-semibold capitalize transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              status === s
                ? s === "approved"
                  ? "status-approved"
                  : s === "rejected"
                    ? "status-rejected"
                    : "status-pending"
                : "border-border/70 bg-muted/25 text-muted-foreground hover:border-primary/25 hover:bg-accent hover:text-foreground",
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}


