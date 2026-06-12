export type Role = "operator" | "admin" | "management";
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

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface InvoiceInput {
  customerName: string;
  invoiceNumber: string;
  ewayBill?: string | null;
  quantityMeters?: string | null;
  countConstruction?: string | null;
  remark?: string | null;
  invoiceDate?: string | null;
}
