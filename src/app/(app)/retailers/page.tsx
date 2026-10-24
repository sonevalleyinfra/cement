import { asc, desc, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { areas, creditLimitChanges, retailers, user as users } from "@/db/schema";
import { creditChangeParts } from "@/lib/credit-rules";
import { formatDateTime } from "@/lib/datetime";
import { hasNoLimit, NO_LIMIT_FILTER, NO_REP_FILTER, needsSalesRep } from "@/lib/home-rules";
import { can, rolesFor } from "@/lib/permissions";
import { pickableRetailerLogins } from "@/lib/retailer-rules";
import { pickableSalesReps } from "@/lib/sales-rep-rules";
import { requireRole } from "@/lib/session";
import { isCreditStatus } from "@/lib/shop-lists";
import { RetailersView } from "./retailers-view";

export default async function RetailersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Retailer phones are internal: staff only (a retailer would see every other shop).
  const { user } = await requireRole(...rolesFor("viewRetailers"));
  // `?filter=no-rep` (from Home): only the switched-on shops that still need a sales person.
  const filter = (await searchParams).filter;
  const onlyNoRep = filter === NO_REP_FILTER;
  // Only admin edits; sales, accounts and admin see the credit terms (not logistics).
  const canEdit = can(user.role, "editRetailers");
  const canSeeCredit = can(user.role, "viewLedger");
  // `?filter=no-limit` (from Home): switched-on shops with no credit limit. Ignored for roles that may not see credit.
  const onlyNoLimit = canSeeCredit && filter === NO_LIMIT_FILTER;
  // The last 5 credit changes of each shop, for admin's shop sheet.
  const ranked = db
    .select({
      id: creditLimitChanges.id,
      retailerId: creditLimitChanges.retailerId,
      changedBy: creditLimitChanges.changedBy,
      oldLimitPaise: creditLimitChanges.oldLimitPaise,
      newLimitPaise: creditLimitChanges.newLimitPaise,
      oldCreditDays: creditLimitChanges.oldCreditDays,
      newCreditDays: creditLimitChanges.newCreditDays,
      oldStatus: creditLimitChanges.oldStatus,
      newStatus: creditLimitChanges.newStatus,
      createdAt: creditLimitChanges.createdAt,
      rn: sql<number>`row_number() over (partition by ${creditLimitChanges.retailerId} order by ${creditLimitChanges.createdAt} desc, ${creditLimitChanges.id} desc)`.as("rn"),
    })
    .from(creditLimitChanges)
    .as("ranked");
  const [rows, people, areaRows, history] = await Promise.all([
    db
      .select({
        id: retailers.id,
        name: retailers.name,
        phone: retailers.phone,
        place: retailers.place,
        active: retailers.active,
        userId: retailers.userId,
        salesRepId: retailers.salesRepId,
        ownerName: retailers.ownerName,
        altPhone: retailers.altPhone,
        address: retailers.address,
        areaId: retailers.areaId,
        pincode: retailers.pincode,
        lat: retailers.lat,
        lng: retailers.lng,
        category: retailers.category,
        openedOn: retailers.openedOn,
        gstin: retailers.gstin,
        creditLimitPaise: retailers.creditLimitPaise,
        creditDays: retailers.creditDays,
        creditStatus: retailers.creditStatus,
      })
      .from(retailers)
      .orderBy(asc(retailers.name)),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        banned: users.banned,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .orderBy(asc(users.name)),
    db
      .select({ id: areas.id, name: areas.name, active: areas.active })
      .from(areas)
      .orderBy(asc(areas.sortOrder), asc(areas.name)),
    canEdit
      ? db.select().from(ranked).where(lte(ranked.rn, 5)).orderBy(desc(ranked.createdAt), desc(ranked.id))
      : Promise.resolve([]),
  ]);
  const areaNames = new Map(areaRows.map((a) => [a.id, a.name]));
  const names = new Map(people.map((u) => [u.id, u.name]));
  const activeRepIds = new Set(people.filter((u) => !u.banned && !u.deletedAt).map((u) => u.id));
  const shown = rows
    .filter((r) => !onlyNoRep || needsSalesRep(r, activeRepIds))
    .filter((r) => !onlyNoLimit || hasNoLimit(r))
    .map(({ creditLimitPaise, creditDays, creditStatus, ...r }) => ({
      ...r,
      salesRepName: r.salesRepId ? (names.get(r.salesRepId) ?? "") : "",
      loginName: r.userId ? (names.get(r.userId) ?? "") : "",
      areaName: r.areaId ? (areaNames.get(r.areaId) ?? "") : "",
      // Credit terms are not sent at all to roles that may not see them.
      credit: canSeeCredit
        ? { limitPaise: creditLimitPaise, creditDays, status: isCreditStatus(creditStatus) ? creditStatus : "ok" }
        : null,
      creditHistory: history
        .filter((h) => h.retailerId === r.id)
        .map((h) => ({
          id: h.id,
          summary: creditChangeParts(h).join(" · "),
          by: names.get(h.changedBy) ?? "Someone",
          at: formatDateTime(h.createdAt),
        })),
    }));
  // Areas admin may pick: the switched-on ones (each shop also keeps its own, even if off).
  const pickableAreas = canEdit ? areaRows.filter((a) => a.active).map((a) => ({ id: a.id, label: a.name })) : null;
  // Retailer logins not linked to any shop yet (each row also keeps its own current login).
  const logins = can(user.role, "linkRetailerLogin")
    ? pickableRetailerLogins(
        people,
        rows.map((r) => r.userId),
      ).map((u) => ({ id: u.id, label: `${u.name} (${u.email})` }))
    : null;
  const salesReps = can(user.role, "assignSalesRep")
    ? pickableSalesReps(people).map((u) => ({ id: u.id, label: u.name }))
    : null;
  return (
    <RetailersView
      rows={shown}
      canEdit={canEdit}
      logins={logins}
      salesReps={salesReps}
      areas={pickableAreas}
      onlyNoRep={onlyNoRep}
      onlyNoLimit={onlyNoLimit}
      canRecordPayment={can(user.role, "recordReceipt")}
      canOrder={can(user.role, "placeOrder")}
    />
  );
}
