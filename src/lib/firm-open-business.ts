import { and, eq, exists, inArray, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { ledgerEntries, orders, receiptAllocations, receipts, stockMovements, walletMovements } from "@/db/schema";
import { OPEN_ORDER_STATUSES, type OpenBusiness } from "@/lib/firm-rules";

/** A database or a transaction. */
type Conn = Pick<typeof db, "select">;

/**
 * Counts what is still open for one firm (bags, balances, cash, orders, payments).
 * Read-only, server-only. The rule that uses it is `openBusinessProblem`.
 * All sums are done in SQL and read as numbers (bigint-safe, no ::int).
 * Pass the transaction to read inside it (after locking the firm row).
 */
export async function getOpenBusiness(firmId: string, conn: Conn = db): Promise<OpenBusiness> {
  const answer = alias(walletMovements, "answer");
  // A payment touches this firm if the money landed in its bank or any of it pays this firm.
  const touchesFirm = or(
    eq(receipts.receivedFirmId, firmId),
    exists(
      conn
        .select({ one: sql`1` })
        .from(receiptAllocations)
        .where(and(eq(receiptAllocations.receiptId, receipts.id), eq(receiptAllocations.firmId, firmId))),
    ),
  );

  const [stock, balances, cash, requests, openOrders, online, cheques] = await Promise.all([
    // Bags per place and product that are not zero.
    conn
      .select({ locationId: stockMovements.locationId })
      .from(stockMovements)
      .where(eq(stockMovements.firmId, firmId))
      .groupBy(stockMovements.locationId, stockMovements.productId)
      .having(sql`sum(${stockMovements.bags}) <> 0`),
    // Retailers whose ledger balance with this firm is not zero.
    conn
      .select({ retailerId: ledgerEntries.retailerId })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.firmId, firmId))
      .groupBy(ledgerEntries.retailerId)
      .having(sql`sum(${ledgerEntries.amountPaise}) <> 0`),
    // Cash per collector: collected - reversed - confirmed handovers, if above zero.
    conn
      .select({ collectorId: walletMovements.collectorId })
      .from(walletMovements)
      .where(eq(walletMovements.firmId, firmId))
      .groupBy(walletMovements.collectorId)
      .having(
        sql`sum(case ${walletMovements.kind}
          when 'collected' then ${walletMovements.amountPaise}
          when 'reversed' then -${walletMovements.amountPaise}
          when 'handover_confirmed' then -${walletMovements.amountPaise}
          else 0 end) > 0`,
      ),
    // Handover requests with no confirmed / rejected row pointing at them.
    conn
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(walletMovements)
      .where(
        and(
          eq(walletMovements.firmId, firmId),
          eq(walletMovements.kind, "handover_request"),
          notExists(
            conn
              .select({ one: sql`1` })
              .from(answer)
              .where(
                and(
                  eq(answer.refId, walletMovements.id),
                  inArray(answer.kind, ["handover_confirmed", "handover_rejected"]),
                ),
              ),
          ),
        ),
      ),
    conn
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(orders)
      .where(and(eq(orders.firmId, firmId), inArray(orders.status, [...OPEN_ORDER_STATUSES]))),
    conn
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(receipts)
      .where(
        and(touchesFirm, eq(receipts.mode, "online"), eq(receipts.status, "unverified")),
      ),
    conn
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(receipts)
      .where(and(touchesFirm, eq(receipts.mode, "cheque"), eq(receipts.status, "pending"))),
  ]);

  return {
    stockPlaces: new Set(stock.map((r) => r.locationId)).size,
    retailersWithBalance: balances.length,
    collectorsHoldingCash: cash.length,
    openHandoverRequests: requests[0]?.n ?? 0,
    openOrders: openOrders[0]?.n ?? 0,
    unverifiedOnline: online[0]?.n ?? 0,
    pendingCheques: cheques[0]?.n ?? 0,
  };
}
