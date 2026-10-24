import { cache } from "react";
import { db } from "@/db";
import { retailers, walletMovements } from "@/db/schema";
import { getOverrideTotals } from "@/lib/credit-check";
import { hasNoLimit, totalDuesPaise } from "@/lib/home-rules";
import { dueRows } from "@/lib/home-stats";
import { nameMaps } from "@/lib/names";
import { getOverdueRows } from "@/lib/overdue";
import { sortOverdue } from "@/lib/overdue-rules";
import {
  cashWithStaff,
  collections,
  dsoDays,
  overduePercent,
  stockValue,
  type HomeWindows,
} from "@/lib/owner-home-rules";
import { istStartOf, rangeOf, type ReportRange } from "@/lib/report-range";
import { getProfitReport, getSalesReport, paymentsReceivedIn, purchaseCostRows } from "@/lib/reports";
import { purchaseCostTotals } from "@/lib/sales-report";
import { paymentsByMode } from "@/lib/staff-report";
import { getBalances } from "@/lib/stock";

/**
 * Read-only numbers for the Owner Home (admin). Server-only, and only called from `AdminHome`, which
 * the dashboard renders for admins only (`homeSections`) behind `requireUser()`.
 * Every formula is in `owner-home-rules.ts`; this file only reads rows.
 */

/** Payments received in the range (by `received_on`), by mode: the same rows as Reports → Cash. */
async function collected(range: ReportRange) {
  return collections(paymentsByMode(await paymentsReceivedIn(range)));
}

/** The overdue rows once per request and IST day (Risk and Top overdue share them). */
const overdueRows = cache((dayKey: string) => getOverdueRows(istStartOf(dayKey)));

export async function getOwnerToday(w: HomeWindows) {
  const today = rangeOf(w.today, w.today);
  const [sales, cash] = await Promise.all([getSalesReport(today), collected(today)]);
  return { salesPaise: sales.valuePaise, bags: sales.bags, collected: cash };
}

export async function getOwnerMonth(w: HomeWindows) {
  const [sales, prevSales, profit, prevProfit, cash, prevCash] = await Promise.all([
    getSalesReport(w.mtd),
    getSalesReport(w.prev),
    getProfitReport(w.mtd),
    getProfitReport(w.prev),
    collected(w.mtd),
    collected(w.prev),
  ]);
  return {
    sales: { paise: sales.valuePaise, bags: sales.bags },
    prevSales: { paise: prevSales.valuePaise, bags: prevSales.bags },
    margin: { paise: profit.total.profitPaise, perBagPaise: profit.total.profitPerBagPaise },
    prevMargin: { paise: prevProfit.total.profitPaise, perBagPaise: prevProfit.total.profitPerBagPaise },
    collected: cash,
    prevCollected: prevCash,
  };
}

export async function getOwnerRisk(w: HomeWindows, now: Date) {
  const [dues, overdue, sales90, balances, costs, shops, overrides] = await Promise.all([
    dueRows(),
    overdueRows(w.today),
    getSalesReport(w.last90),
    getBalances(),
    purchaseCostRows(now),
    db.select({ active: retailers.active, creditLimitPaise: retailers.creditLimitPaise }).from(retailers),
    // Approvals over the credit check this month so far (IST).
    getOverrideTotals(w.mtd),
  ]);
  const outstanding = totalDuesPaise(dues);
  const overduePaise = overdue.reduce((n, r) => n + r.overduePaise, 0);
  return {
    outstandingPaise: outstanding,
    overduePct: overduePercent(overduePaise, outstanding),
    dso: dsoDays(outstanding, sales90.valuePaise),
    stock: stockValue(balances, purchaseCostTotals(costs)),
    noLimitShops: shops.filter(hasNoLimit).length,
    overrides: { count: overrides.count, overLimitPaise: overrides.overLimitPaise },
  };
}

export const TOP_OVERDUE = 10;

/** The biggest overdue shops (switched-on first), at most 10. */
export async function getTopOverdue(w: HomeWindows) {
  const rows = await overdueRows(w.today);
  return sortOverdue(rows.filter((r) => r.overduePaise > 0)).slice(0, TOP_OVERDUE);
}

export async function getCashWithStaff(now: Date) {
  const [rows, names] = await Promise.all([
    db
      .select({
        id: walletMovements.id,
        collectorId: walletMovements.collectorId,
        kind: walletMovements.kind,
        amountPaise: walletMovements.amountPaise,
        refId: walletMovements.refId,
        createdAt: walletMovements.createdAt,
      })
      .from(walletMovements),
    nameMaps(),
  ]);
  return cashWithStaff(rows, names.people, now);
}
