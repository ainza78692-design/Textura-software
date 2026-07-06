begin;

alter table invoices drop constraint if exists invoices_invoice_number_key;

create unique index if not exists idx_invoices_created_by_invoice_number_unique
  on invoices (created_by, lower(invoice_number));

commit;