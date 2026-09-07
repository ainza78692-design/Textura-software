-- Migration 005: Add denier / net-weight fields to invoices
-- Safe additive migration – all columns are nullable so existing rows are unaffected.
begin;

alter table invoices
  add column if not exists count_1        text,
  add column if not exists denier_outward_1 numeric(12,4),
  add column if not exists count_2        text,
  add column if not exists denier_outward_2 numeric(12,4),
  add column if not exists gsm            numeric(8,2),
  add column if not exists width          numeric(8,2),
  add column if not exists net_weight     numeric(12,4);

commit;
