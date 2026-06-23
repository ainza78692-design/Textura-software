import { Router } from "express";
import * as controller from "../controllers/invoice.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/require-role";

export const invoiceRouter = Router();

invoiceRouter.use(requireAuth);

invoiceRouter.get("/export", asyncHandler(controller.exportInvoices));
invoiceRouter.get("/", asyncHandler(controller.listInvoices));
invoiceRouter.get("/:id", asyncHandler(controller.getInvoice));
invoiceRouter.post("/", requireRole("operator", "admin"), asyncHandler(controller.createInvoice));
invoiceRouter.post("/bulk", requireRole("operator", "admin"), asyncHandler(controller.bulkCreateInvoices));
invoiceRouter.delete("/bulk", requireRole("operator", "admin"), asyncHandler(controller.bulkDeleteInvoices));
invoiceRouter.patch("/:id", requireRole("operator", "admin"), asyncHandler(controller.updateInvoice));
invoiceRouter.delete("/:id", requireRole("operator", "admin"), asyncHandler(controller.deleteInvoice));
invoiceRouter.patch(
  "/:id/documents/:documentCode",
  requireRole("operator", "admin"),
  asyncHandler(controller.updateDocument)
);

