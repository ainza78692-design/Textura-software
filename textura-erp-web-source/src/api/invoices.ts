import { apiBaseUrl, apiRequest, getAuthToken } from "./client";
import type {
  DocumentCode,
  DocStatus,
  Invoice,
  InvoiceInput,
  InvoiceSearchParams,
} from "@/types/api";

function toQuery(params: InvoiceSearchParams = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  return search.toString();
}

export function listInvoices(params?: InvoiceSearchParams) {
  const query = toQuery(params);
  return apiRequest<{ invoices: Invoice[]; pagination: { limit: number; offset: number } }>(
    `/invoices${query ? `?${query}` : ""}`,
  );
}

export function getInvoice(id: string) {
  return apiRequest<{ invoice: Invoice }>(`/invoices/${id}`);
}

export function createInvoice(input: InvoiceInput) {
  return apiRequest<{ invoice: Invoice }>("/invoices", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function bulkCreateInvoices(invoices: InvoiceInput[]) {
  return apiRequest<{
    created: Invoice[];
    failed: { row: number; invoiceNumber: string; customerName: string; reason: string }[];
  }>("/invoices/bulk", {
    method: "POST",
    body: JSON.stringify({ invoices }),
  });
}

export function updateInvoice(id: string, input: Partial<InvoiceInput>) {
  return apiRequest<{ invoice: Invoice }>(`/invoices/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteInvoice(id: string) {
  return apiRequest<{ deleted: number }>(`/invoices/${id}`, {
    method: "DELETE",
  });
}

export function deleteInvoices(ids: string[]) {
  return apiRequest<{ deleted: number }>("/invoices/bulk", {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });
}

export function updateDocumentStatus(
  invoiceId: string,
  documentCode: DocumentCode,
  status: DocStatus,
  remark?: string | null,
) {
  return apiRequest<{ invoice: Invoice }>(`/invoices/${invoiceId}/documents/${documentCode}`, {
    method: "PATCH",
    body: JSON.stringify({ status, remark }),
  });
}

export function finalSubmitInvoice(invoiceId: string) {
  return apiRequest<{ invoice: Invoice }>(`/invoices/${invoiceId}/final-submit`, {
    method: "POST",
  });
}

export async function exportInvoices(params: InvoiceSearchParams = {}) {
  const query = toQuery(params);
  const token = await getAuthToken();
  const baseUrl = await apiBaseUrl();
  const response = await fetch(`${baseUrl}/invoices/export${query ? `?${query}` : ""}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error("Unable to export invoices");
  }

  return response.blob();
}
