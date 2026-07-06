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
  | "tc"
  | "inditex"
  | "textile_genesis";

export type FixedProfile = "yes_fashion" | "test_user";

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
  inditex?: string | null;
  textileGenesis?: string | null;
  documentStatuses?: Partial<Record<DocumentCode, DocStatus>>;
  remark?: string | null;
  invoiceDate?: string | null;
}
