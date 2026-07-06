import type { DocumentCode } from "../types/domain";

export const REQUIRED_DOCUMENT_CODES = [
  "invoice",
  "eway_bill",
  "grs",
  "po",
  "count_construction",
  "mbs",
  "tc",
] as const satisfies readonly DocumentCode[];

export const OPTIONAL_DOCUMENT_CODES = ["inditex", "textile_genesis"] as const satisfies readonly DocumentCode[];

export const ALL_DOCUMENT_CODES = [
  ...REQUIRED_DOCUMENT_CODES,
  ...OPTIONAL_DOCUMENT_CODES,
] as const satisfies readonly DocumentCode[];

export const DOCUMENT_LABELS: Record<DocumentCode, string> = {
  invoice: "Invoice",
  eway_bill: "E-way Bill",
  grs: "GRS",
  po: "PO",
  count_construction: "Count Construction",
  mbs: "MBS",
  tc: "TC",
  inditex: "Inditex",
  textile_genesis: "Textile Genesis",
};

export function isRequiredDocument(code: DocumentCode) {
  return (REQUIRED_DOCUMENT_CODES as readonly string[]).includes(code);
}

export function hasOptionalDocumentData(value: unknown) {
  return String(value ?? "").trim().length > 0;
}
