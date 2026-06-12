begin;

create extension if not exists pgcrypto;

create type user_role as enum ('operator', 'admin', 'management');
create type workflow_status as enum ('pending', 'approved', 'rejected');
create type document_code as enum (
  'invoice',
  'eway_bill',
  'grs',
  'po',
  'count_construction',
  'mbs',
  'tc'
);

create table app_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) >= 2),
  email text not null unique,
  password_hash text not null,
  role user_role not null default 'operator',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  invoice_number text not null unique,
  eway_bill text,
  grs_number text,
  po_number text,
  quantity_meters text,
  count_construction text,
  mbs text,
  tc_status text,
  remark text,
  invoice_date date,
  final_status workflow_status not null default 'pending',
  final_submitted_at timestamptz,
  created_by uuid not null references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector not null default ''::tsvector
);

create table invoice_documents (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  document_code document_code not null,
  status workflow_status not null default 'pending',
  remark text,
  sort_order smallint not null,
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, document_code)
);

create table invoice_audit_log (
  id bigserial primary key,
  invoice_id uuid references invoices(id) on delete cascade,
  actor_id uuid references app_users(id),
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger app_users_set_updated_at
before update on app_users
for each row execute function set_updated_at();

create trigger invoices_set_updated_at
before update on invoices
for each row execute function set_updated_at();

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

create trigger invoices_set_search_vector
before insert or update on invoices
for each row execute function set_invoice_search_vector();

create trigger invoice_documents_set_updated_at
before update on invoice_documents
for each row execute function set_updated_at();

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
  end;
  return new;
end;
$$;

create trigger invoice_documents_sort_order
before insert or update of document_code on invoice_documents
for each row execute function set_document_sort_order();

create index idx_invoices_final_status on invoices(final_status);
create index idx_invoices_customer_name on invoices(customer_name);
create index idx_invoices_invoice_date on invoices(invoice_date);
create index idx_invoices_created_at on invoices(created_at);
create index idx_invoices_search_vector on invoices using gin(search_vector);
create index idx_invoice_documents_status on invoice_documents(status);
create index idx_invoice_documents_code_status on invoice_documents(document_code, status);
create index idx_invoice_audit_invoice_created on invoice_audit_log(invoice_id, created_at desc);

commit;
