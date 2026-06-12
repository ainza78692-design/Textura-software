begin;

alter table invoices
  add column if not exists quantity_meters text;

create or replace function set_invoice_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector = to_tsvector(
    'simple',
    coalesce(new.customer_name, '') || ' ' ||
    coalesce(new.invoice_number, '') || ' ' ||
    coalesce(new.eway_bill, '') || ' ' ||
    coalesce(new.grs_number, '') || ' ' ||
    coalesce(new.po_number, '') || ' ' ||
    coalesce(new.quantity_meters, '') || ' ' ||
    coalesce(new.count_construction, '') || ' ' ||
    coalesce(new.mbs, '') || ' ' ||
    coalesce(new.tc_status, '') || ' ' ||
    coalesce(new.remark, '') || ' ' ||
    coalesce(new.final_status::text, '')
  );
  return new;
end;
$$;

update invoices set updated_at = updated_at;

commit;
