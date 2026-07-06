import type { Request, Response } from "express";
import * as invoiceService from "../services/invoice.service";
import {
  bulkDeleteInvoicesSchema,
  bulkInvoiceInputSchema,
  documentCodeSchema,
  invoiceInputSchema,
  invoiceSearchSchema,
  updateDocumentSchema,
  updateInvoiceSchema,
} from "../validators/invoice.validators";

export async function createInvoice(req: Request, res: Response) {
  const payload = invoiceInputSchema.parse(req.body);
  const invoice = await invoiceService.createInvoice(payload, req.user!);
  res.status(201).json({ invoice });
}

export async function bulkCreateInvoices(req: Request, res: Response) {
  const payload = bulkInvoiceInputSchema.parse(req.body);
  const result = await invoiceService.bulkCreateInvoices(payload.invoices, req.user!);
  res.status(201).json(result);
}

export async function updateInvoice(req: Request, res: Response) {
  const payload = updateInvoiceSchema.parse(req.body);
  const invoice = await invoiceService.updateInvoice(String(req.params.id), payload, req.user!);
  res.json({ invoice });
}

export async function deleteInvoice(req: Request, res: Response) {
  const result = await invoiceService.deleteInvoice(String(req.params.id), req.user!);
  res.json(result);
}

export async function bulkDeleteInvoices(req: Request, res: Response) {
  const payload = bulkDeleteInvoicesSchema.parse(req.body);
  const result = await invoiceService.deleteInvoices(payload.ids, req.user!);
  res.json(result);
}

export async function updateDocument(req: Request, res: Response) {
  const documentCode = documentCodeSchema.parse(req.params.documentCode);
  const payload = updateDocumentSchema.parse(req.body);
  const invoice = await invoiceService.updateDocumentStatus(
    String(req.params.id),
    documentCode,
    payload,
    req.user!,
  );
  res.json({ invoice });
}



export async function getInvoice(req: Request, res: Response) {
  const invoice = await invoiceService.getInvoice(String(req.params.id), req.user!);
  res.json({ invoice });
}

export async function listInvoices(req: Request, res: Response) {
  const filters = invoiceSearchSchema.parse(req.query);
  const invoices = await invoiceService.listInvoices(filters, req.user!);
  res.json({ invoices, pagination: { limit: filters.limit, offset: filters.offset } });
}

export async function exportInvoices(req: Request, res: Response) {
  const filters = invoiceSearchSchema.parse({ ...req.query, limit: 100, offset: 0 });
  const workbook = await invoiceService.exportInvoicesWorkbook(filters, req.user!);
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="invoice-export-${stamp}.xlsx"`);
  res.send(workbook);
}

