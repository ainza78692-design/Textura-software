alter type document_code add value if not exists 'inditex';
alter type document_code add value if not exists 'textile_genesis';

alter table invoices add column if not exists inditex text;
alter table invoices add column if not exists textile_genesis text;

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
    coalesce(new.inditex, '') || ' ' ||
    coalesce(new.textile_genesis, '') || ' ' ||
    coalesce(new.remark, '') || ' ' ||
    coalesce(new.final_status::text, '')
  );
  return new;
end;
$$;

create or replace function set_document_sort_order()
returns trigger
language plpgsql
as $$
begin
  new.sort_order = case new.document_code
    when 'invoice' then 10
    when 'eway_bill' then 20
    when 'grs' then 30
    when 'po' then 40
    when 'count_construction' then 50
    when 'mbs' then 60
    when 'tc' then 70
    when 'inditex' then 80
    when 'textile_genesis' then 90
  end;
  return new;
end;
$$;

update invoices set updated_at = updated_at;
update invoice_documents set document_code = document_code;

