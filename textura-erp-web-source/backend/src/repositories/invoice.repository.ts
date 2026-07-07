import type pg from "pg";
import { ALL_DOCUMENT_CODES, DOCUMENT_LABELS, OPTIONAL_DOCUMENT_CODES, REQUIRED_DOCUMENT_CODES, hasOptionalDocumentData } from "../domain/documents";
import { query, transaction } from "../db/pool";
import type { DocStatus, DocumentCode, FinalStatus, InvoiceInput } from "../types/domain";

const TEST_USER_EMAIL = "testuser@textura.local";

type DbClient = pg.PoolClient;

export interface InvoiceScope {
  userId: string;
  isTestUser: boolean;
}

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

function blankToNull(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function optionalValueForCode(input: InvoiceInput, code: DocumentCode) {
  if (code === "inditex") return input.inditex;
  if (code === "textile_genesis") return input.textileGenesis;
  return null;
}

function statusFor(input: InvoiceInput, code: DocumentCode, fallback: DocStatus) {
  return input.documentStatuses?.[code] ?? fallback;
}

function addScope(where: string[], values: unknown[], scope?: InvoiceScope, alias = "i") {
  if (!scope) return;
  if (scope.isTestUser) {
    values.push(scope.userId);
    where.push(`${alias}.created_by = $${values.length}`);
    return;
  }

  values.push(TEST_USER_EMAIL);
  where.push(`not exists (
    select 1 from app_users scope_user
    where scope_user.id = ${alias}.created_by and lower(scope_user.email) = lower($${values.length})
  )`);
}

async function syncOptionalDocuments(
  client: DbClient,
  invoiceId: string,
  input: Pick<InvoiceInput, "inditex" | "textileGenesis" | "documentStatuses">,
  userId: string,
) {
  for (const code of OPTIONAL_DOCUMENT_CODES) {
    const value = optionalValueForCode(input as InvoiceInput, code);
    if (value === undefined) continue;

    if (hasOptionalDocumentData(value)) {
      await client.query(
        `insert into invoice_documents (invoice_id, document_code, status, updated_by)
         values ($1, $2, $3, $4)
         on conflict (invoice_id, document_code)
         do update set status = excluded.status, updated_by = excluded.updated_by`,
        [invoiceId, code, input.documentStatuses?.[code] ?? "approved", userId],
      );
    } else {
      await client.query("delete from invoice_documents where invoice_id = $1 and document_code = $2", [
        invoiceId,
        code,
      ]);
    }
  }
}

export async function createInvoice(input: InvoiceInput, userId: string) {
  return transaction(async (client) => {
    const invoice = await client.query(
      `insert into invoices (
        customer_name, invoice_number, eway_bill, grs_number, po_number,
        quantity_meters, count_construction, mbs, tc_status, inditex, textile_genesis,
        remark, invoice_date, created_by, updated_by
      )
      values ($1,$2,$3,null,null,$4,$5,null,null,$6,$7,$8,$9,$10,$10)
      returning *`,
      [
        input.customerName,
        input.invoiceNumber,
        blankToNull(input.ewayBill),
        blankToNull(input.quantityMeters),
        blankToNull(input.countConstruction),
        blankToNull(input.inditex),
        blankToNull(input.textileGenesis),
        blankToNull(input.remark),
        input.invoiceDate ?? null,
        userId,
      ],
    );

    for (const code of REQUIRED_DOCUMENT_CODES) {
      await client.query(
        "insert into invoice_documents (invoice_id, document_code, status, updated_by) values ($1, $2, $3, $4)",
        [invoice.rows[0].id, code, statusFor(input, code, "pending"), userId],
      );
    }

    for (const code of OPTIONAL_DOCUMENT_CODES) {
      const value = optionalValueForCode(input, code);
      if (!hasOptionalDocumentData(value)) continue;
      await client.query(
        "insert into invoice_documents (invoice_id, document_code, status, updated_by) values ($1, $2, $3, $4)",
        [invoice.rows[0].id, code, statusFor(input, code, "approved"), userId],
      );
    }

    await insertAudit(client, invoice.rows[0].id, userId, "invoice_created", {
      invoiceNumber: input.invoiceNumber,
      defaultDocumentStatus: "pending",
      documentStatuses: input.documentStatuses ?? {},
    });

    return getInvoiceById(invoice.rows[0].id, client);
  });
}

export async function updateInvoice(
  id: string,
  input: Partial<InvoiceInput>,
  userId: string,
  scope?: InvoiceScope,
) {
  return transaction(async (client) => {
    const values: unknown[] = [
      id,
      input.customerName,
      input.invoiceNumber,
      blankToNull(input.ewayBill),
      blankToNull(input.quantityMeters),
      blankToNull(input.countConstruction),
      blankToNull(input.remark),
      input.invoiceDate,
      Object.prototype.hasOwnProperty.call(input, "inditex"),
      blankToNull(input.inditex),
      Object.prototype.hasOwnProperty.call(input, "textileGenesis"),
      blankToNull(input.textileGenesis),
      userId,
    ];
    const where = ["id = $1"];
    addScope(where, values, scope, "invoices");

    const result = await client.query(
      `update invoices set
        customer_name = coalesce($2, customer_name),
        invoice_number = coalesce($3, invoice_number),
        eway_bill = coalesce($4, eway_bill),
        quantity_meters = coalesce($5, quantity_meters),
        count_construction = coalesce($6, count_construction),
        remark = coalesce($7, remark),
        invoice_date = coalesce($8, invoice_date),
        inditex = case when $9::boolean then $10 else inditex end,
        textile_genesis = case when $11::boolean then $12 else textile_genesis end,
        updated_by = $13
       where ${where.join(" and ")}
       returning *`,
      values,
    );

    if (!result.rowCount) return null;
    await syncOptionalDocuments(client, id, input, userId);
    await insertAudit(client, id, userId, "invoice_updated", input);
    return getInvoiceById(id, client);
  });
}

export async function getInvoiceByNumber(invoiceNumber: string, scope?: InvoiceScope) {
  const values: unknown[] = [invoiceNumber];
  const where = ["lower(i.invoice_number) = lower($1)"];
  addScope(where, values, scope, "i");

  const result = await query<{ id: string }>(
    `select i.id
     from invoices i
     where ${where.join(" and ")}
     limit 1`,
    values,
  );

  if (!result.rows[0]) return null;
  return getInvoiceById(result.rows[0].id, undefined, scope);
}
export async function updateDocumentStatus(
  invoiceId: string,
  documentCode: DocumentCode,
  input: { status: DocStatus; remark?: string | null },
  userId: string,
  scope?: InvoiceScope,
) {
  const values: unknown[] = [invoiceId, documentCode, input.status, input.remark ?? null, userId];
  const where = [
    "d.invoice_id = i.id",
    "d.invoice_id = $1",
    "d.document_code = $2",
  ];
  addScope(where, values, scope, "i");

  const result = await query(
    `update invoice_documents d
     set status = $3, remark = $4, updated_by = $5
     from invoices i
     where ${where.join(" and ")}
     returning d.*`,
    values,
  );

  if (!result.rowCount) return null;
  await insertAudit(undefined, invoiceId, userId, "document_status_updated", {
    documentCode,
    status: input.status,
  });
  return getInvoiceById(invoiceId, undefined, scope);
}

export async function finalSubmit(invoiceId: string, finalStatus: FinalStatus, userId: string) {
  return transaction(async (client) => {
    const result = await client.query(
      `update invoices
       set final_status = $2, final_submitted_at = coalesce(final_submitted_at, now()), updated_by = $3
       where id = $1
       returning *`,
      [invoiceId, finalStatus, userId],
    );

    if (!result.rowCount) return null;
    await insertAudit(client, invoiceId, userId, "final_submitted", { finalStatus });
    return getInvoiceById(invoiceId, client);
  });
}

export async function updateFinalStatus(
  invoiceId: string,
  finalStatus: FinalStatus,
  userId: string,
  scope?: InvoiceScope,
) {
  const values: unknown[] = [invoiceId, finalStatus, userId];
  const where = ["id = $1"];
  addScope(where, values, scope, "invoices");

  const result = await query(
    `update invoices
     set final_status = $2, updated_by = $3
     where ${where.join(" and ")}
     returning *`,
    values,
  );

  if (!result.rowCount) return null;
  await insertAudit(undefined, invoiceId, userId, "final_status_recalculated", { finalStatus });
  return getInvoiceById(invoiceId, undefined, scope);
}

export async function deleteInvoice(id: string, scope?: InvoiceScope) {
  const values: unknown[] = [id];
  const where = ["id = $1"];
  addScope(where, values, scope, "invoices");
  const result = await query(`delete from invoices where ${where.join(" and ")} returning id`, values);
  return result.rowCount ?? 0;
}

export async function deleteInvoices(ids: string[], scope?: InvoiceScope) {
  const values: unknown[] = [ids];
  const where = ["id = any($1::uuid[])"];
  addScope(where, values, scope, "invoices");
  const result = await query(`delete from invoices where ${where.join(" and ")} returning id`, values);
  return result.rowCount ?? 0;
}

export async function getInvoiceById(id: string, client?: DbClient, scope?: InvoiceScope) {
  const values: unknown[] = [id];
  const where = ["i.id = $1"];
  addScope(where, values, scope, "i");

  const invoice = await q(
    client,
    `select i.*, creator.full_name as created_by_name, updater.full_name as updated_by_name
     from invoices i
     left join app_users creator on creator.id = i.created_by
     left join app_users updater on updater.id = i.updated_by
     where ${where.join(" and ")}`,
    values,
  );
  if (!invoice.rows[0]) return null;

  const documents = await q(
    client,
    "select document_code, status, remark, updated_at, updated_by from invoice_documents where invoice_id = $1 order by sort_order",
    [id],
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
}, scope?: InvoiceScope) {
  const values: unknown[] = [];
  const where: string[] = [];
  addScope(where, values, scope, "i");

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
        or lower(coalesce(i.inditex, '')) like $${values.length}
        or lower(coalesce(i.textile_genesis, '')) like $${values.length}
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
              ${ALL_DOCUMENT_CODES.map((code) => `when '${code}' then '${DOCUMENT_LABELS[code]}'`).join("\n              ")}
            end,
            'status', d.status
          )
          order by d.sort_order
        )
        from invoice_documents d
        where d.invoice_id = i.id
      ), '[]'::jsonb) as documents_summary
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

export async function listInvoicesForExport(filters: Parameters<typeof listInvoices>[0], scope?: InvoiceScope) {
  const values: unknown[] = [];
  const where: string[] = [];
  addScope(where, values, scope, "i");

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
        or lower(coalesce(i.quantity_meters, '')) like $${values.length}
        or lower(coalesce(i.count_construction, '')) like $${values.length}
        or lower(coalesce(i.inditex, '')) like $${values.length}
        or lower(coalesce(i.textile_genesis, '')) like $${values.length}
        or lower(coalesce(i.remark, '')) like $${values.length}
        or lower(i.final_status::text) like $${values.length}
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
      i.inditex,
      i.textile_genesis,
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
      max(case when d.document_code = 'tc' then d.status::text end) as tc_status_doc,
      max(case when d.document_code = 'inditex' then d.status::text end) as inditex_status,
      max(case when d.document_code = 'textile_genesis' then d.status::text end) as textile_genesis_status
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

export async function getRequiredDocumentStatuses(invoiceId: string, scope?: InvoiceScope) {
  const values: unknown[] = [invoiceId, REQUIRED_DOCUMENT_CODES];
  const where = ["d.invoice_id = $1", "d.document_code = any($2::document_code[])"];
  if (scope) {
    where.push("d.invoice_id = i.id");
    addScope(where, values, scope, "i");
  }
  const from = scope ? "invoice_documents d join invoices i on i.id = d.invoice_id" : "invoice_documents d";
  const result = await query<{ status: DocStatus }>(
    `select d.status from ${from} where ${where.join(" and ")} order by d.sort_order`,
    values,
  );
  return result.rows.map((row) => row.status);
}

export async function insertAudit(
  client: DbClient | undefined,
  invoiceId: string,
  actorId: string,
  action: string,
  payload: unknown,
) {
  await q(
    client,
    "insert into invoice_audit_log (invoice_id, actor_id, action, payload) values ($1, $2, $3, $4)",
    [invoiceId, actorId, action, JSON.stringify(payload ?? {})],
  );
}
