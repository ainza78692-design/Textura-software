import { ApiError } from "../middleware/api-error";
import * as repo from "../repositories/invoice.repository";
import type { DocStatus, DocumentCode, InvoiceInput } from "../types/domain";
import { calculateFinalStatus } from "./invoice-status";
import * as XLSX from "xlsx";

export async function createInvoice(input: InvoiceInput, userId: string) {
  return repo.createInvoice(input, userId);
}

export async function bulkCreateInvoices(inputs: InvoiceInput[], userId: string) {
  const created = [];
  const failed: { row: number; invoiceNumber: string; customerName: string; reason: string }[] = [];

  for (const [index, input] of inputs.entries()) {
    try {
      created.push(await repo.createInvoice(input, userId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create invoice";
      failed.push({
        row: index + 1,
        invoiceNumber: input.invoiceNumber,
        customerName: input.customerName,
        reason: message.includes("duplicate") ? "Invoice number already exists" : message,
      });
    }
  }

  return { created, failed };
}

export async function updateInvoice(id: string, input: Partial<InvoiceInput>, userId: string) {
  const invoice = await repo.updateInvoice(id, input, userId);
  if (!invoice)
    throw new ApiError(404, "Invoice not found or already final-submitted", "INVOICE_NOT_EDITABLE");
  return invoice;
}

export async function deleteInvoice(id: string) {
  const deleted = await repo.deleteInvoice(id);
  if (!deleted) throw new ApiError(404, "Invoice not found", "INVOICE_NOT_FOUND");
  return { deleted };
}

export async function deleteInvoices(ids: string[]) {
  const deleted = await repo.deleteInvoices(ids);
  return { deleted };
}

export async function updateDocumentStatus(
  invoiceId: string,
  documentCode: DocumentCode,
  input: { status: DocStatus; remark?: string | null },
  userId: string,
) {
  let invoice = await repo.updateDocumentStatus(invoiceId, documentCode, input, userId);
  if (!invoice)
    throw new ApiError(
      404,
      "Invoice document not found or invoice is locked",
      "DOCUMENT_NOT_EDITABLE",
    );
  if (invoice.final_submitted_at) {
    const statuses = await repo.getDocumentStatuses(invoiceId);
    const finalStatus = calculateFinalStatus(statuses);
    invoice = (await repo.updateFinalStatus(invoiceId, finalStatus, userId)) ?? invoice;
  }
  return invoice;
}

export async function finalSubmit(invoiceId: string, userId: string) {
  const statuses = await repo.getDocumentStatuses(invoiceId);
  if (!statuses.length) throw new ApiError(404, "Invoice not found", "INVOICE_NOT_FOUND");

  const finalStatus = calculateFinalStatus(statuses);
  const invoice = await repo.finalSubmit(invoiceId, finalStatus, userId);
  if (!invoice)
    throw new ApiError(409, "Invoice has already been final-submitted", "ALREADY_SUBMITTED");
  return invoice;
}

export async function getInvoice(id: string) {
  const invoice = await repo.getInvoiceById(id);
  if (!invoice) throw new ApiError(404, "Invoice not found", "INVOICE_NOT_FOUND");
  return invoice;
}

export async function listInvoices(filters: Parameters<typeof repo.listInvoices>[0]) {
  return repo.listInvoices(filters);
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
) {
  const rows = await repo.listInvoicesForExport(filters);
  const headers = [
    "Customer Name",
    "Invoice Number",
    "E-way Bill",
    "Quantity (Meters)",
    "Count Construction",
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
    "Created At",
    "Updated At",
  ];

  const worksheetRows = rows.map((row) => ({
    "Customer Name": row.customer_name ?? "",
    "Invoice Number": row.invoice_number ?? "",
    "E-way Bill": row.eway_bill ?? "",
    "Quantity (Meters)": row.quantity_meters ?? "",
    "Count Construction": row.count_construction ?? "",
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
    "Created At": formatDateTime(row.created_at),
    "Updated At": formatDateTime(row.updated_at),
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(worksheetRows, { header: headers });
  worksheet["!cols"] = headers.map((header) => ({ wch: Math.max(14, header.length + 2) }));
  XLSX.utils.book_append_sheet(workbook, worksheet, "Invoices");

  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
}
