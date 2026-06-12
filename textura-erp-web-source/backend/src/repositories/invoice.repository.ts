import type pg from "pg";
import { query, transaction } from "../db/pool";
import type { DocStatus, DocumentCode, FinalStatus, InvoiceInput } from "../types/domain";

const DOCUMENT_CODES: DocumentCode[] = [
  "invoice",
  "eway_bill",
  "grs",
  "po",
  "count_construction",
  "mbs",
  "tc"
];

type DbClient = pg.PoolClient;

function q(client: DbClient | undefined, text: string, values: unknown[] = []) {
  return client ? client.query(text, values) : query(text, values);
}

function searchTerms(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[_/-]+/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function compactSearchTerm(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export async function createInvoice(input: InvoiceInput, userId: string) {
  return transaction(async (client) => {
    const invoice = await client.query(
      `insert into invoices (
        customer_name, invoice_number, eway_bill, grs_number, po_number,
        quantity_meters, count_construction, mbs, tc_status, remark, invoice_date, created_by, updated_by
      )
      values ($1,$2,$3,null,null,$4,$5,null,null,$6,$7,$8,$8)
      returning *`,
      [
        input.customerName,
        input.invoiceNumber,
        input.ewayBill ?? null,
        input.quantityMeters ?? null,
        input.countConstruction ?? null,
        input.remark ?? null,
        input.invoiceDate ?? null,
        userId
      ]
    );

    for (const code of DOCUMENT_CODES) {
      await client.query(
        "insert into invoice_documents (invoice_id, document_code, status, updated_by) values ($1, $2, 'pending', $3)",
        [invoice.rows[0].id, code, userId]
      );
    }

    await insertAudit(client, invoice.rows[0].id, userId, "invoice_created", {
      invoiceNumber: input.invoiceNumber,
      defaultDocumentStatus: "pending"
    });

    return getInvoiceById(invoice.rows[0].id, client);
  });
}

export async function updateInvoice(id: string, input: Partial<InvoiceInput>, userId: string) {
  const result = await query(
    `update invoices set
      customer_name = coalesce($2, customer_name),
      invoice_number = coalesce($3, invoice_number),
      eway_bill = coalesce($4, eway_bill),
      quantity_meters = coalesce($5, quantity_meters),
      count_construction = coalesce($6, count_construction),
      remark = coalesce($7, remark),
      invoice_date = coalesce($8, invoice_date),
      updated_by = $9
     where id = $1
     returning *`,
    [
      id,
      input.customerName,
      input.invoiceNumber,
      input.ewayBill,
      input.quantityMeters,
      input.countConstruction,
      input.remark,
      input.invoiceDate,
      userId
    ]
  );

  if (!result.rowCount) return null;
  await insertAudit(undefined, id, userId, "invoice_updated", input);
  return getInvoiceById(id);
}

export async function updateDocumentStatus(
  invoiceId: string,
  documentCode: DocumentCode,
  input: { status: DocStatus; remark?: string | null },
  userId: string
) {
  const result = await query(
    `update invoice_documents d
     set status = $3, remark = $4, updated_by = $5
     from invoices i
     where d.invoice_id = i.id
       and d.invoice_id = $1
       and d.document_code = $2
     returning d.*`,
    [invoiceId, documentCode, input.status, input.remark ?? null, userId]
  );

  if (!result.rowCount) return null;
  await insertAudit(undefined, invoiceId, userId, "document_status_updated", {
    documentCode,
    status: input.status
  });
  return getInvoiceById(invoiceId);
}

export async function finalSubmit(invoiceId: string, finalStatus: FinalStatus, userId: string) {
  return transaction(async (client) => {
    const result = await client.query(
      `update invoices
       set final_status = $2, final_submitted_at = coalesce(final_submitted_at, now()), updated_by = $3
       where id = $1
       returning *`,
      [invoiceId, finalStatus, userId]
    );

    if (!result.rowCount) return null;
    await insertAudit(client, invoiceId, userId, "final_submitted", { finalStatus });
    return getInvoiceById(invoiceId, client);
  });
}

export async function updateFinalStatus(invoiceId: string, finalStatus: FinalStatus, userId: string) {
  const result = await query(
    `update invoices
     set final_status = $2, updated_by = $3
     where id = $1 and final_submitted_at is not null
     returning *`,
    [invoiceId, finalStatus, userId]
  );

  if (!result.rowCount) return null;
  await insertAudit(undefined, invoiceId, userId, "final_status_recalculated", { finalStatus });
  return getInvoiceById(invoiceId);
}

export async function deleteInvoice(id: string) {
  const result = await query("delete from invoices where id = $1 returning id", [id]);
  return result.rowCount ?? 0;
}

export async function deleteInvoices(ids: string[]) {
  const result = await query("delete from invoices where id = any($1::uuid[]) returning id", [ids]);
  return result.rowCount ?? 0;
}

export async function getInvoiceById(id: string, client?: DbClient) {
  const invoice = await q(
    client,
    `select i.*, creator.full_name as created_by_name, updater.full_name as updated_by_name
     from invoices i
     left join app_users creator on creator.id = i.created_by
     left join app_users updater on updater.id = i.updated_by
     where i.id = $1`,
    [id]
  );
  if (!invoice.rows[0]) return null;

  const documents = await q(
    client,
    "select document_code, status, remark, updated_at, updated_by from invoice_documents where invoice_id = $1 order by sort_order",
    [id]
  );

  return { ...invoice.rows[0], documents: documents.rows };
}

export async function listInvoices(filters: {
  q?: string;
  status?: DocStatus;
  customer?: string;
  document?: DocumentCode;
  documentStatus?: DocStatus;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
}) {
  const values: unknown[] = [];
  const where: string[] = [];

  if (filters.status) {
    values.push(filters.status);
    where.push(`i.final_status = $${values.length}`);
  }
  if (filters.customer) {
    values.push(`%${filters.customer.toLowerCase()}%`);
    where.push(`lower(i.customer_name) like $${values.length}`);
  }
  if (filters.q) {
    const terms = searchTerms(filters.q);
    for (const term of terms) {
      values.push(`%${term}%`);
      where.push(`(
        lower(coalesce(i.customer_name, '')) like $${values.length}
        or lower(coalesce(i.invoice_number, '')) like $${values.length}
        or lower(coalesce(i.eway_bill, '')) like $${values.length}
        or lower(coalesce(i.grs_number, '')) like $${values.length}
        or lower(coalesce(i.po_number, '')) like $${values.length}
        or lower(coalesce(i.quantity_meters, '')) like $${values.length}
        or lower(coalesce(i.count_construction, '')) like $${values.length}
        or lower(coalesce(i.mbs, '')) like $${values.length}
        or lower(coalesce(i.tc_status, '')) like $${values.length}
        or lower(coalesce(i.remark, '')) like $${values.length}
        or lower(i.final_status::text) like $${values.length}
        or exists (
          select 1 from invoice_documents sd
          where sd.invoice_id = i.id
            and (
              lower(replace(sd.document_code::text, '_', ' ')) like $${values.length}
              or lower(sd.document_code::text) like $${values.length}
              or lower(sd.status::text) like $${values.length}
              or lower(coalesce(sd.remark, '')) like $${values.length}
            )
        )
      )`);
    }
    const compact = /[^a-z0-9\s]/i.test(filters.q) ? compactSearchTerm(filters.q) : "";
    if (compact) {
      values.push(`%${compact}%`);
      where.push(`(
        regexp_replace(lower(coalesce(i.customer_name, '')), '[^a-z0-9]+', '', 'g') like $${values.length}
        or regexp_replace(lower(coalesce(i.invoice_number, '')), '[^a-z0-9]+', '', 'g') like $${values.length}
        or regexp_replace(lower(coalesce(i.eway_bill, '')), '[^a-z0-9]+', '', 'g') like $${values.length}
      )`);
    }
  }
  if (filters.dateFrom) {
    values.push(filters.dateFrom);
    where.push(`i.invoice_date >= $${values.length}`);
  }
  if (filters.dateTo) {
    values.push(filters.dateTo);
    where.push(`i.invoice_date <= $${values.length}`);
  }
  if (filters.document && filters.documentStatus) {
    values.push(filters.document, filters.documentStatus);
    where.push(`exists (
      select 1 from invoice_documents d
      where d.invoice_id = i.id and d.document_code = $${values.length - 1} and d.status = $${values.length}
    )`);
  }

  values.push(filters.limit, filters.offset);
  const sql = `
    select
      i.*,
      creator.full_name as created_by_name,
      updater.full_name as updated_by_name,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'document_code', d.document_code,
            'label', case d.document_code
              when 'invoice' then 'Invoice'
              when 'eway_bill' then 'E-way Bill'
              when 'grs' then 'GRS'
              when 'po' then 'PO'
              when 'count_construction' then 'Count Construction'
              when 'mbs' then 'MBS'
              when 'tc' then 'TC'
            end,
            'status', d.status
          )
          order by d.sort_order
        )
        from invoice_documents d
        where d.invoice_id = i.id
          and d.status in ('pending', 'rejected')
      ), '[]'::jsonb) as pending_documents
    from invoices i
    left join app_users creator on creator.id = i.created_by
    left join app_users updater on updater.id = i.updated_by
    ${where.length ? `where ${where.join(" and ")}` : ""}
    order by i.updated_at desc
    limit $${values.length - 1} offset $${values.length}
  `;

  const result = await query(sql, values);
  return result.rows;
}

export async function listInvoicesForExport(filters: {
  q?: string;
  status?: DocStatus;
  customer?: string;
  document?: DocumentCode;
  documentStatus?: DocStatus;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
}) {
  const values: unknown[] = [];
  const where: string[] = [];

  if (filters.status) {
    values.push(filters.status);
    where.push(`i.final_status = $${values.length}`);
  }
  if (filters.customer) {
    values.push(`%${filters.customer.toLowerCase()}%`);
    where.push(`lower(i.customer_name) like $${values.length}`);
  }
  if (filters.q) {
    const terms = searchTerms(filters.q);
    for (const term of terms) {
      values.push(`%${term}%`);
      where.push(`(
        lower(coalesce(i.customer_name, '')) like $${values.length}
        or lower(coalesce(i.invoice_number, '')) like $${values.length}
        or lower(coalesce(i.eway_bill, '')) like $${values.length}
        or lower(coalesce(i.grs_number, '')) like $${values.length}
        or lower(coalesce(i.po_number, '')) like $${values.length}
        or lower(coalesce(i.quantity_meters, '')) like $${values.length}
        or lower(coalesce(i.count_construction, '')) like $${values.length}
        or lower(coalesce(i.mbs, '')) like $${values.length}
        or lower(coalesce(i.tc_status, '')) like $${values.length}
        or lower(coalesce(i.remark, '')) like $${values.length}
        or lower(i.final_status::text) like $${values.length}
        or exists (
          select 1 from invoice_documents sd
          where sd.invoice_id = i.id
            and (
              lower(replace(sd.document_code::text, '_', ' ')) like $${values.length}
              or lower(sd.document_code::text) like $${values.length}
              or lower(sd.status::text) like $${values.length}
              or lower(coalesce(sd.remark, '')) like $${values.length}
            )
        )
      )`);
    }
    const compact = /[^a-z0-9\s]/i.test(filters.q) ? compactSearchTerm(filters.q) : "";
    if (compact) {
      values.push(`%${compact}%`);
      where.push(`(
        regexp_replace(lower(coalesce(i.customer_name, '')), '[^a-z0-9]+', '', 'g') like $${values.length}
        or regexp_replace(lower(coalesce(i.invoice_number, '')), '[^a-z0-9]+', '', 'g') like $${values.length}
        or regexp_replace(lower(coalesce(i.eway_bill, '')), '[^a-z0-9]+', '', 'g') like $${values.length}
      )`);
    }
  }
  if (filters.dateFrom) {
    values.push(filters.dateFrom);
    where.push(`i.invoice_date >= $${values.length}`);
  }
  if (filters.dateTo) {
    values.push(filters.dateTo);
    where.push(`i.invoice_date <= $${values.length}`);
  }
  if (filters.document && filters.documentStatus) {
    values.push(filters.document, filters.documentStatus);
    where.push(`exists (
      select 1 from invoice_documents d
      where d.invoice_id = i.id and d.document_code = $${values.length - 1} and d.status = $${values.length}
    )`);
  }

  const sql = `
    select
      i.customer_name,
      i.invoice_number,
      i.eway_bill,
      i.grs_number,
      i.po_number,
      i.quantity_meters,
      i.count_construction,
      i.mbs,
      i.tc_status,
      i.remark,
      i.invoice_date,
      i.final_status,
      i.final_submitted_at,
      i.created_at,
      i.updated_at,
      creator.full_name as created_by_name,
      updater.full_name as updated_by_name,
      max(case when d.document_code = 'invoice' then d.status::text end) as invoice_doc_status,
      max(case when d.document_code = 'eway_bill' then d.status::text end) as eway_bill_status,
      max(case when d.document_code = 'grs' then d.status::text end) as grs_status,
      max(case when d.document_code = 'po' then d.status::text end) as po_status,
      max(case when d.document_code = 'count_construction' then d.status::text end) as count_construction_status,
      max(case when d.document_code = 'mbs' then d.status::text end) as mbs_status,
      max(case when d.document_code = 'tc' then d.status::text end) as tc_status_doc
    from invoices i
    left join app_users creator on creator.id = i.created_by
    left join app_users updater on updater.id = i.updated_by
    left join invoice_documents d on d.invoice_id = i.id
    ${where.length ? `where ${where.join(" and ")}` : ""}
    group by i.id, creator.full_name, updater.full_name
    order by i.invoice_date desc nulls last, i.updated_at desc
  `;

  const result = await query(sql, values);
  return result.rows;
}

export async function getDocumentStatuses(invoiceId: string) {
  const result = await query<{ status: DocStatus }>(
    "select status from invoice_documents where invoice_id = $1 order by sort_order",
    [invoiceId]
  );
  return result.rows.map((row) => row.status);
}

export async function insertAudit(
  client: DbClient | undefined,
  invoiceId: string,
  actorId: string,
  action: string,
  payload: unknown
) {
  await q(
    client,
    "insert into invoice_audit_log (invoice_id, actor_id, action, payload) values ($1, $2, $3, $4)",
    [invoiceId, actorId, action, JSON.stringify(payload ?? {})]
  );
}
