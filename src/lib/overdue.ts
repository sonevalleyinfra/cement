import { asc, desc, eq, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { ledgerEntries, receipts, retailers, user } from "@/db/schema";
import { toISTDateKey } from "@/lib/datetime";
import { LAST_PAYMENT_SKIPS } from "@/lib/home-rules";
import { buildOverdueRows, type LastPayment, type OverdueShop } from "@/lib/overdue-rules";

/**
 * Every shop that owes, with its overdue amount and last standing payment. Read-only, server-only.
 * Unscoped: callers limit it with `shopScope` + `filterOverdue` / `collectToday`.
 */
export async function getOverdueRows(asOf = new Date()) {
  const [rows, shops, payments] = await Promise.all([
    db
      .select({
        retailerId: ledgerEntries.retailerId,
        kind: ledgerEntries.kind,
        amountPaise: ledgerEntries.amountPaise,
        orderId: ledgerEntries.orderId,
        createdAt: ledgerEntries.createdAt,
      })
      .from(ledgerEntries)
      .orderBy(asc(ledgerEntries.createdAt), asc(ledgerEntries.id)),
    db
      .select({
        id: retailers.id,
        name: retailers.name,
        place: retailers.place,
        phone: retailers.phone,
        creditDays: retailers.creditDays,
        active: retailers.active,
        salesRepId: retailers.salesRepId,
        salesRepName: user.name,
      })
      .from(retailers)
      .leftJoin(user, eq(user.id, retailers.salesRepId)),
    // The newest payment per shop that still stands (not rejected or reversed).
    db
      .selectDistinctOn([receipts.retailerId], {
        retailerId: receipts.retailerId,
        totalPaise: receipts.totalPaise,
        createdAt: receipts.createdAt,
      })
      .from(receipts)
      .where(notInArray(receipts.status, [...LAST_PAYMENT_SKIPS]))
      .orderBy(receipts.retailerId, desc(receipts.createdAt)),
  ]);
  const shopMap = new Map<string, OverdueShop>(shops.map((s) => [s.id, s]));
  const last = new Map<string, LastPayment>(payments.map((p) => [p.retailerId, { totalPaise: p.totalPaise, createdAt: p.createdAt }]));
  return buildOverdueRows(rows, shopMap, last, toISTDateKey(asOf));
}
