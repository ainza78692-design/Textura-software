export type DocStatus = "pending" | "approved" | "rejected";
export type FinalStatus = DocStatus;

export type DocumentCode =
  | "invoice"
  | "eway_bill"
  | "grs"
  | "po"
  | "count_construction"
  | "mbs"
  | "tc";

export interface InvoiceDocument {
  document_code: DocumentCode;
  status: DocStatus;
  remark: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface Invoice {
  id: string;
  customer_name: string;
  invoice_number: string;
  eway_bill: string | null;
  grs_number: string | null;
  po_number: string | null;
  count_construction: string | null;
  mbs: string | null;
  tc_status: string | null;
  remark: string | null;
  invoice_date: string | null;
  final_status: FinalStatus;
  final_submitted_at: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  documents?: InvoiceDocument[];
}

export interface InvoiceInput {
  customerName: string;
  invoiceNumber: string;
  ewayBill?: string | null;
  grsNumber?: string | null;
  poNumber?: string | null;
  countConstruction?: string | null;
  mbs?: string | null;
  tcStatus?: string | null;
  remark?: string | null;
  invoiceDate?: string | null;
}

export interface InvoiceSearchParams {
  q?: string;
  status?: DocStatus;
  customer?: string;
  document?: DocumentCode;
  documentStatus?: DocStatus;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}
