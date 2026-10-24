import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { creditOverrides, retailers, user } from "@/db/schema";
import { readCreditFacts } from "@/lib/credit-check-queries";
import { assessCredit, overrideTotals, type CreditAssessment } from "@/lib/credit-check-rules";
import { toISTDateKey } from "@/lib/datetime";
import { orderTotalPaise } from "@/lib/order-rules";
import type { ReportRange } from "@/lib/report-range";

/**
 * Server-only. The credit check of every order on the approvals page, read once for all of them (one
 * query per kind, credit-check-queries.ts). Each card counts the shop's OTHER approved / partly
 * dispatched orders as not sent; other placed orders waiting on the same page do not count (they are
 * not approved). This is only what the screen shows: approving checks again in the transaction.
 * Returns null when it could not be read, so every card fails closed ("Couldn't check dues").
 */
export async function getCreditExposures(
  list: readonly { id: string; retailerId: string; bags: number; ratePaise: number }[],
  now = new Date(),
): Promise<Map<string, CreditAssessment> | null> {
  try {
    const facts = await readCreditFacts(
      db,
      list.map((o) => o.retailerId),
      toISTDateKey(now),
    );
    const out = new Map<string, CreditAssessment>();
    for (const o of list) {
      const f = facts.get(o.retailerId);
      if (f) out.set(o.id, assessCredit(f, orderTotalPaise(o.bags, o.ratePaise)));
    }
    return out;
  } catch (error) {
    console.error("Credit check failed to load", error);
    return null;
  }
}

const inRange = (range: Pick<ReportRange, "start" | "end">) =>
  and(gte(creditOverrides.createdAt, range.start), lt(creditOverrides.createdAt, range.end));

/** Every approval over the credit check in the range, newest first (Reports → Overrides, admin). */
export async function getOverrides(range: ReportRange) {
  return db
    .select({
      id: creditOverrides.id,
      orderId: creditOverrides.orderId,
      createdAt: creditOverrides.createdAt,
      shop: retailers.name,
      by: user.name,
      reasonCode: creditOverrides.reasonCode,
      note: creditOverrides.note,
      orderPaise: creditOverrides.orderPaise,
      overLimitPaise: creditOverrides.overLimitPaise,
    })
    .from(creditOverrides)
    .innerJoin(retailers, eq(retailers.id, creditOverrides.retailerId))
    .innerJoin(user, eq(user.id, creditOverrides.actorId))
    .where(inRange(range))
    .orderBy(desc(creditOverrides.createdAt), desc(creditOverrides.id));
}

/** How many overrides in the range and how much went over the limit (owner Home). */
export async function getOverrideTotals(range: Pick<ReportRange, "start" | "end">) {
  const rows = await db
    .select({ orderPaise: creditOverrides.orderPaise, overLimitPaise: creditOverrides.overLimitPaise })
    .from(creditOverrides)
    .where(inRange(range));
  return overrideTotals(rows);
}
