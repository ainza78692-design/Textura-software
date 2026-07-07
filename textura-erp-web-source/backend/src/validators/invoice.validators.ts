import { z } from "zod";

export const docStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const documentCodeSchema = z.enum([
  "invoice",
  "eway_bill",
  "grs",
  "po",
  "count_construction",
  "mbs",
  "tc",
  "inditex",
  "textile_genesis"
]);

export const invoiceInputSchema = z.object({
  customerName: z.string().trim().min(1, "Customer name is required").max(180),
  invoiceNumber: z.string().trim().min(1, "Invoice number is required").max(80),
  ewayBill: z.string().trim().max(120).nullish(),
  quantityMeters: z.string().trim().max(80).nullish(),
  countConstruction: z.string().trim().max(180).nullish(),
  inditex: z.string().trim().max(180).nullish(),
  textileGenesis: z.string().trim().max(180).nullish(),
  documentStatuses: z.record(documentCodeSchema, docStatusSchema).optional(),
  remark: z.string().trim().max(2000).nullish(),
  invoiceDate: z.string().date().nullish()
});

export const updateInvoiceSchema = invoiceInputSchema.partial();

export const bulkInvoiceInputSchema = z.object({
  invoices: z.array(invoiceInputSchema).min(1).max(500)
});

export const bulkDeleteInvoicesSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500)
});

export const updateDocumentSchema = z.object({
  status: docStatusSchema,
  remark: z.string().trim().max(1000).nullish()
});

export const invoiceSearchSchema = z.object({
  q: z.string().trim().optional(),
  status: docStatusSchema.optional(),
  customer: z.string().trim().optional(),
  document: documentCodeSchema.optional(),
  documentStatus: docStatusSchema.optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

