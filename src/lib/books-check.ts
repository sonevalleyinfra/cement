/**
 * Books check queries (ADR 0001, decision 2). SELECT only: this file never writes.
 * Each query returns offending rows as (kind, ref, what, unit, got, want); see BooksRow in
 * books-check-rules.ts, which turns the results into pass/fail lines.
 * Ported from the audit's check.sql (its labels I10/I11 are the ADR's I11/I12).
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { activityLogCutoff, ROW_CAP, type BooksRow, type CheckId, type CheckResult } from "./books-check-rules";

const QUERIES: Record<Exclude<CheckId, "I12">, SQL> = {
  // Running stock per product per place, in time order; the lowest point must not go below 0.
  I1: sql`
    select 'stock' kind, null::text ref, p.name || ' · ' || coalesce(g.name, v.number) what,
      'bags' unit, x.low::bigint got, null::bigint want
    from (
      select product_id, godown_id, vehicle_id, min(run) low from (
        select product_id, godown_id, vehicle_id,
          sum(bags) over (partition by product_id, godown_id, vehicle_id order by created_at, id) run
        from stock_movements
      ) r group by 1, 2, 3
    ) x
    join products p on p.id = x.product_id
    left join godowns g on g.id = x.godown_id
    left join vehicles v on v.id = x.vehicle_id
    where x.low < 0`,
  I2: sql`
    select 'order' kind, o.id::text ref, 'Order · ' || r.name || ' · ' || o.status what,
      'bags' unit, x.sent got, o.bags::bigint want
    from orders o
    join retailers r on r.id = o.retailer_id
    cross join lateral (select coalesce(sum(d.bags), 0)::bigint sent from dispatches d where d.order_id = o.id) x
    where x.sent > o.bags
      or (o.status = 'dispatched' and x.sent <> o.bags)
      or (o.status = 'partly_dispatched' and not (x.sent between 1 and o.bags - 1))
      or (o.status in ('placed', 'approved', 'rejected') and x.sent <> 0)`,
  I3: sql`
    select 'order' kind, o.id::text ref, 'Order · ' || r.name || ' · billed' what,
      'paise' unit, b.led got, a.disp want
    from orders o
    join retailers r on r.id = o.retailer_id
    cross join lateral (select coalesce(sum(d.bags::bigint * d.rate_paise), 0)::bigint disp from dispatches d where d.order_id = o.id) a
    cross join lateral (
      select coalesce(sum(l.amount_paise), 0)::bigint led from ledger_entries l where l.order_id = o.id and l.kind = 'order_debit'
    ) b
    where a.disp <> b.led`,
  I4: sql`
    select 'order' kind, o.id::text ref, 'Order · ' || r.name || ' · stock out' what,
      'bags' unit, b.taken got, a.sent want
    from orders o
    join retailers r on r.id = o.retailer_id
    cross join lateral (select coalesce(sum(d.bags), 0)::bigint sent from dispatches d where d.order_id = o.id) a
    cross join lateral (
      select (-coalesce(sum(m.bags), 0))::bigint as taken from stock_movements m where m.order_id = o.id and m.type = 'dispatch'
    ) b
    where a.sent <> b.taken`,
  I5: sql`
    select 'stock' kind, null::text ref, p.name || ' · moves' what, 'bags' unit, x.net got, 0::bigint want
    from (select m.product_id, sum(m.bags)::bigint net from stock_movements m where m.type = 'transfer' group by 1) x
    join products p on p.id = x.product_id
    where x.net <> 0`,
  I6: sql`
    select 'supplier' kind, p.brand_id::text ref,
      'Purchase · ' || p.name || case when s.id is null then ' · no supplier entry' when s.brand_id <> p.brand_id then ' · other supplier' else '' end what,
      'paise' unit, s.amount_paise::bigint got, (m.bags::bigint * m.unit_cost_paise)::bigint want
    from stock_movements m
    join products p on p.id = m.product_id
    left join supplier_ledger_entries s on s.stock_movement_id = m.id and s.kind = 'purchase'
    where m.type = 'purchase' and (s.id is null or s.amount_paise <> m.bags::bigint * m.unit_cost_paise or s.brand_id <> p.brand_id)
    union all
    select 'supplier', (array_agg(s.brand_id::text))[1],
      case when s.stock_movement_id is null then 'Supplier purchase without stock' else 'Supplier purchase entries' end,
      null, count(*)::bigint, case when s.stock_movement_id is null then null else 1 end::bigint
    from supplier_ledger_entries s
    where s.kind = 'purchase'
    group by s.stock_movement_id
    having count(*) <> 1 or s.stock_movement_id is null`,
  // I7 sums every ledger row of a payment by receipt_id, whatever its kind: the payment credit and
  // its reversal (receipt_reversal, or a + receipt_credit row from before 0039) net to 0 once reversed.
  I7: sql`
    select 'receipt' kind, r.id::text ref, 'Payment #' || r.receipt_no || ' · ' || r.mode || ' · ' || r.status what,
      'paise' unit, x.led got, (case when r.status in ('received', 'verified') then -r.total_paise else 0 end)::bigint want
    from receipts r
    cross join lateral (select coalesce(sum(l.amount_paise), 0)::bigint led from ledger_entries l where l.receipt_id = r.id) x
    where x.led <> case when r.status in ('received', 'verified') then -r.total_paise else 0 end`,
  I8: sql`
    select 'receipt' kind, r.id::text ref, 'Payment #' || r.receipt_no || ' · collected' what,
      'paise' unit, w.col got, r.total_paise::bigint want
    from receipts r
    cross join lateral (
      select coalesce(sum(w.amount_paise) filter (where w.kind = 'collected'), 0)::bigint col,
        coalesce(sum(w.amount_paise) filter (where w.kind = 'reversed'), 0)::bigint rev,
        count(*) filter (where w.kind = 'reversed') revs
      from wallet_movements w where w.receipt_id = r.id
    ) w
    where r.mode = 'cash' and w.col <> r.total_paise
    union all
    select 'receipt', r.id::text, 'Payment #' || r.receipt_no || ' · ' || r.status || ' · cash back', 'paise', w.rev,
      (case when r.status = 'reversed' then r.total_paise else 0 end)::bigint
    from receipts r
    cross join lateral (
      select coalesce(sum(w.amount_paise) filter (where w.kind = 'reversed'), 0)::bigint rev,
        count(*) filter (where w.kind = 'reversed') revs
      from wallet_movements w where w.receipt_id = r.id
    ) w
    where r.mode = 'cash' and (w.rev not in (0, r.total_paise) or (r.status <> 'reversed' and w.revs > 0))
    union all
    select 'receipt', r.id::text, 'Payment #' || r.receipt_no || ' · wallet row on ' || u.name, 'paise', w.amount_paise::bigint, null
    from wallet_movements w
    join receipts r on r.id = w.receipt_id
    join "user" u on u.id = w.collector_id
    where w.kind in ('collected', 'reversed') and (r.mode <> 'cash' or w.collector_id <> r.received_by)`,
  I9: sql`
    select 'staff' kind, b.collector_id ref, u.name || ' · cash below 0' what, 'paise' unit, (b.held - b.pending)::bigint got, null::bigint want
    from (
      select w.collector_id,
        sum(case w.kind when 'collected' then w.amount_paise when 'reversed' then -w.amount_paise
          when 'handover_confirmed' then -w.amount_paise else 0 end) held,
        sum(case when w.kind = 'handover_request' and not exists (select 1 from wallet_movements a where a.ref_id = w.id)
          then w.amount_paise else 0 end) pending
      from wallet_movements w group by 1
    ) b
    join "user" u on u.id = b.collector_id
    where b.held < 0 or b.held - b.pending < 0
    union all
    select 'staff', (array_agg(a.collector_id))[1], 'Handover answered more than once', null, count(*)::bigint, 1::bigint
    from wallet_movements a
    where a.kind in ('handover_confirmed', 'handover_rejected')
    group by a.ref_id
    having count(*) > 1
    union all
    select 'staff', a.collector_id, 'Handover confirmed · ' || u.name, 'paise', a.amount_paise::bigint, q.amount_paise::bigint
    from wallet_movements a
    join wallet_movements q on q.id = a.ref_id
    join "user" u on u.id = a.collector_id
    where a.kind = 'handover_confirmed'
      and (a.amount_paise > q.amount_paise or q.kind <> 'handover_request' or a.collector_id <> q.collector_id)`,
  // Every book table's person column. Only stock_movements was ever nullable; the rest are cheap to confirm.
  I11: sql`
    select 'stock' kind, null::text ref, 'Stock ' || m.type || ' · ' || p.name what, 'bags' unit, m.bags::bigint got, null::bigint want
    from stock_movements m join products p on p.id = m.product_id where m.actor_id is null
    union all
    select 'retailer', l.retailer_id::text, 'Ledger ' || l.kind, 'paise', l.amount_paise::bigint, null from ledger_entries l where l.actor_id is null
    union all
    select 'staff', w.collector_id, 'Wallet ' || w.kind, 'paise', w.amount_paise::bigint, null from wallet_movements w where w.actor_id is null
    union all
    select 'supplier', s.brand_id::text, 'Supplier ' || s.kind, 'paise', s.amount_paise::bigint, null
    from supplier_ledger_entries s where s.actor_id is null
    union all
    select 'order', e.order_id::text, 'Order history · ' || e.to_status, null, null, null from order_events e where e.actor_id is null
    union all
    select 'order', d.order_id::text, 'Dispatch', 'bags', d.bags::bigint, null from dispatches d where d.dispatched_by is null
    union all
    select 'receipt', r.id::text, 'Payment #' || r.receipt_no, 'paise', r.total_paise::bigint, null from receipts r where r.received_by is null
    union all
    select 'none', null, 'Activity log · ' || a.entity, null, null, null from audit_log a where a.actor_id is null`,
};

/** I12: rows written at or after `since` that have no activity-log row. */
function activityLogQuery(since: Date): SQL {
  const t = sql`${since.toISOString()}::timestamptz`;
  return sql`
    select 'stock' kind, null::text ref, 'Stock ' || m.type || ' · ' || p.name what, 'bags' unit, m.bags::bigint got, null::bigint want
    from stock_movements m join products p on p.id = m.product_id
    where m.type in ('opening', 'purchase', 'adjustment') and m.created_at >= ${t}
      and not exists (select 1 from audit_log a where a.entity = 'stock' and a.entity_id = m.id::text)
    union all
    select 'stock', null, 'Stock move · ' || p.name, 'bags', (-m.bags)::bigint, null
    from stock_movements m join products p on p.id = m.product_id
    where m.type = 'transfer' and m.bags < 0 and m.created_at >= ${t}
      and not exists (select 1 from audit_log a where a.entity = 'stock' and a.action = 'transfer' and a.entity_id = m.id::text)
    union all
    select 'order', d.order_id::text, 'Dispatch', 'bags', d.bags::bigint, null
    from dispatches d
    where d.created_at >= ${t} and not exists (select 1 from audit_log a where a.entity = 'dispatch' and a.entity_id = d.id::text)
    union all
    select 'retailer', l.retailer_id::text, 'Ledger ' || l.kind, 'paise', l.amount_paise::bigint, null
    from ledger_entries l
    where l.kind in ('opening', 'adjustment') and l.created_at >= ${t}
      and not exists (select 1 from audit_log a where a.entity = 'ledger' and a.entity_id = l.id::text)
    union all
    select 'receipt', r.id::text, 'Payment #' || r.receipt_no || ' · recorded', 'paise', r.total_paise::bigint, null
    from receipts r
    where r.created_at >= ${t}
      and not exists (select 1 from audit_log a where a.entity = 'payment' and a.action = 'record' and a.entity_id = r.id::text)
    union all
    select 'receipt', r.id::text, 'Payment #' || r.receipt_no || ' · ' || r.status, 'paise', r.total_paise::bigint, null
    from receipts r
    where r.status in ('verified', 'rejected', 'reversed') and r.created_at >= ${t}
      and not exists (
        select 1 from audit_log a where a.entity = 'payment' and a.action in ('verify', 'reject', 'reverse') and a.entity_id = r.id::text
      )
    union all
    select 'staff', w.collector_id, 'Handover request', 'paise', w.amount_paise::bigint, null
    from wallet_movements w
    where w.kind = 'handover_request' and w.created_at >= ${t}
      and not exists (select 1 from audit_log a where a.entity = 'handover' and a.action = 'request' and a.entity_id = w.id::text)
    union all
    select 'staff', w.collector_id, 'Handover answer', 'paise', w.amount_paise::bigint, null
    from wallet_movements w
    where w.kind in ('handover_confirmed', 'handover_rejected') and w.created_at >= ${t}
      and not exists (
        select 1 from audit_log a where a.entity = 'handover' and a.action in ('confirm', 'reject') and a.entity_id = w.ref_id::text
      )
    union all
    select 'supplier', s.brand_id::text, 'Supplier ' || s.kind, 'paise', s.amount_paise::bigint, null
    from supplier_ledger_entries s
    where s.kind <> 'purchase' and s.created_at >= ${t}
      and not exists (select 1 from audit_log a where a.entity in ('supplier_entry', 'prism_entry') and a.entity_id = s.id::text)
    union all
    select 'order', e.order_id::text, 'Order history · ' || e.to_status, null, null, null
    from order_events e
    where e.reason not like '%bags in%' and e.created_at >= ${t}
      and not exists (select 1 from audit_log a where a.entity = 'order' and a.entity_id = e.order_id::text and a.created_at = e.created_at)`;
}

type Counted = BooksRow & { total: number | string };

/** Up to ROW_CAP offending rows plus the full count (the window count is taken before the limit). */
async function runOne(id: CheckId, query: SQL): Promise<CheckResult> {
  try {
    const rows = (await db.execute(
      sql`select x.*, count(*) over () total from (${query}) x order by x.what limit ${ROW_CAP}`,
    )) as unknown as Counted[];
    return {
      id,
      total: rows.length === 0 ? 0 : Number(rows[0].total),
      rows: rows.map((r) => ({ kind: r.kind, ref: r.ref, what: r.what, unit: r.unit, got: r.got, want: r.want })),
    };
  } catch (error) {
    console.error(`Books check ${id} could not run`, error);
    return { id, error: true };
  }
}

async function runActivityLog(): Promise<CheckResult> {
  try {
    const [first] = (await db.execute(sql`select min(created_at) as first_at from audit_log`)) as unknown as {
      first_at: Date | string | null;
    }[];
    const since = activityLogCutoff(first?.first_at);
    if (!since) return { id: "I12", total: 0, rows: [] };
    return runOne("I12", activityLogQuery(since));
  } catch (error) {
    console.error("Books check I12 could not run", error);
    return { id: "I12", error: true };
  }
}

/** Runs every check. A check whose query fails comes back as an error, never as passed. */
export async function runBooksCheck(): Promise<CheckResult[]> {
  return Promise.all([
    ...Object.entries(QUERIES).map(([id, q]) => runOne(id as CheckId, q)),
    runActivityLog(),
  ]);
}
