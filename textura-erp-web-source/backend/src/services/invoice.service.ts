import * as XLSX from "xlsx";
import { REQUIRED_DOCUMENT_CODES } from "../domain/documents";
import { ApiError } from "../middleware/api-error";
import * as repo from "../repositories/invoice.repository";
import type { AuthUser, DocStatus, DocumentCode, InvoiceInput } from "../types/domain";
import { calculateFinalStatus } from "./invoice-status";

function scopeFor(user: AuthUser): repo.InvoiceScope {
  return { userId: user.id, isTestUser: user.email.toLowerCase() === "testuser@textura.local" };
}

async function recalculateInvoiceStatus(invoiceId: string, user: AuthUser) {
  const scope = scopeFor(user);
  const statuses = await repo.getRequiredDocumentStatuses(invoiceId, scope);
  const finalStatus = calculateFinalStatus(statuses);
  return repo.updateFinalStatus(invoiceId, finalStatus, user.id, scope);
}

async function createAndRecalculate(input: InvoiceInput, user: AuthUser) {
  const invoice = await repo.createInvoice(input, user.id);
  return (await recalculateInvoiceStatus(invoice.id, user)) ?? invoice;
}

function isUniqueInvoiceError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return code === "23505" || message.includes("duplicate");
}

async function updateImportedInvoice(input: InvoiceInput, user: AuthUser) {
  const scope = scopeFor(user);
  const existing = await repo.getInvoiceByNumber(input.invoiceNumber, scope);
  if (!existing) return null;

  const updated = await repo.updateInvoice(existing.id, input, user.id, scope);
  if (!updated) return null;

  for (const code of REQUIRED_DOCUMENT_CODES) {
    const status = input.documentStatuses?.[code];
    if (!status) continue;
    await repo.updateDocumentStatus(existing.id, code, { status }, user.id, scope);
  }

  return (await recalculateInvoiceStatus(existing.id, user)) ?? updated;
}

export async function createInvoice(input: InvoiceInput, user: AuthUser) {
  return createAndRecalculate(input, user);
}

export async function bulkCreateInvoices(inputs: InvoiceInput[], user: AuthUser) {
  const created = [];
  const updated = [];
  const failed: { row: number; invoiceNumber: string; customerName: string; reason: string }[] = [];

  for (const [index, input] of inputs.entries()) {
    try {
      created.push(await createAndRecalculate(input, user));
    } catch (error) {
      if (isUniqueInvoiceError(error)) {
        const invoice = await updateImportedInvoice(input, user);
        if (invoice) {
          updated.push(invoice);
          continue;
        }
      }

      const message = error instanceof Error ? error.message : "Unable to create invoice";
      failed.push({
        row: index + 1,
        invoiceNumber: input.invoiceNumber,
        customerName: input.customerName,
        reason: isUniqueInvoiceError(error)
          ? "Invoice number already exists in another profile"
          : message,
      });
    }
  }

  return { created, updated, failed };
}

export async function updateInvoice(id: string, input: Partial<InvoiceInput>, user: AuthUser) {
  const invoice = await repo.updateInvoice(id, input, user.id, scopeFor(user));
  if (!invoice) {
    throw new ApiError(404, "Invoice not found or already final-submitted", "INVOICE_NOT_EDITABLE");
  }
  return invoice;
}

export async function deleteInvoice(id: string, user: AuthUser) {
  const deleted = await repo.deleteInvoice(id, scopeFor(user));
  if (!deleted) throw new ApiError(404, "Invoice not found", "INVOICE_NOT_FOUND");
  return { deleted };
}

export async function deleteInvoices(ids: string[], user: AuthUser) {
  const deleted = await repo.deleteInvoices(ids, scopeFor(user));
  return { deleted };
}

export async function updateDocumentStatus(
  invoiceId: string,
  documentCode: DocumentCode,
  input: { status: DocStatus; remark?: string | null },
  user: AuthUser,
) {
  let invoice = await repo.updateDocumentStatus(invoiceId, documentCode, input, user.id, scopeFor(user));
  if (!invoice) {
    throw new ApiError(404, "Invoice document not found", "DOCUMENT_NOT_EDITABLE");
  }

  const statuses = await repo.getRequiredDocumentStatuses(invoiceId, scopeFor(user));
  const finalStatus = calculateFinalStatus(statuses);
  invoice = (await repo.updateFinalStatus(invoiceId, finalStatus, user.id, scopeFor(user))) ?? invoice;

  return invoice;
}

export async function getInvoice(id: string, user: AuthUser) {
  const invoice = await repo.getInvoiceById(id, undefined, scopeFor(user));
  if (!invoice) throw new ApiError(404, "Invoice not found", "INVOICE_NOT_FOUND");
  return invoice;
}

export async function listInvoices(filters: Parameters<typeof repo.listInvoices>[0], user: AuthUser) {
  return repo.listInvoices(filters, scopeFor(user));
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateOnly(value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value === "string") {
    const isoDate = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoDate) return isoDate[1];
  }

  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateTime(value: unknown) {
  if (value == null || value === "") return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export async function exportInvoicesWorkbook(
  filters: Parameters<typeof repo.listInvoicesForExport>[0],
  user: AuthUser,
) {
  const rows = await repo.listInvoicesForExport(filters, scopeFor(user));
  const headers = [
    "Customer Name",
    "Invoice Number",
    "E-way Bill",
    "Quantity (Meters)",
    "Count Construction",
    "Inditex",
    "Textile Genesis",
    "Remark",
    "Invoice Date",
    "Final Status",
    "Final Submitted At",
    "Created By",
    "Updated By",
    "Invoice Doc Status",
    "E-way Bill Status",
    "GRS Status",
    "PO Status",
    "Count Construction Status",
    "MBS Status",
    "TC Document Status",
    "Inditex Status",
    "Textile Genesis Status",
    "Created At",
    "Updated At",
  ];

  const worksheetRows = rows.map((row) => ({
    "Customer Name": row.customer_name ?? "",
    "Invoice Number": row.invoice_number ?? "",
    "E-way Bill": row.eway_bill ?? "",
    "Quantity (Meters)": row.quantity_meters ?? "",
    "Count Construction": row.count_construction ?? "",
    Inditex: row.inditex ?? "",
    "Textile Genesis": row.textile_genesis ?? "",
    Remark: row.remark ?? "",
    "Invoice Date": formatDateOnly(row.invoice_date),
    "Final Status": row.final_status ?? "",
    "Final Submitted At": formatDateTime(row.final_submitted_at),
    "Created By": row.created_by_name ?? "",
    "Updated By": row.updated_by_name ?? "",
    "Invoice Doc Status": row.invoice_doc_status ?? "",
    "E-way Bill Status": row.eway_bill_status ?? "",
    "GRS Status": row.grs_status ?? "",
    "PO Status": row.po_status ?? "",
    "Count Construction Status": row.count_construction_status ?? "",
    "MBS Status": row.mbs_status ?? "",
    "TC Document Status": row.tc_status_doc ?? "",
    "Inditex Status": row.inditex_status ?? "",
    "Textile Genesis Status": row.textile_genesis_status ?? "",
    "Created At": formatDateTime(row.created_at),
    "Updated At": formatDateTime(row.updated_at),
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(worksheetRows, { header: headers });
  worksheet["!cols"] = headers.map((header) => ({ wch: Math.max(14, header.length + 2) }));
  XLSX.utils.book_append_sheet(workbook, worksheet, "Invoices");

  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
}
