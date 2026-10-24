/** Rules for the retailers master. Plain functions: no database, no request. */

import { isValidIndianMobile, normalizePhone } from "./phone-rules";
import { canLinkRetailerUser } from "./rate-rules";
import { hasRole } from "./roles";
import { creditChange, validateCredit, type CreditChange, type CreditForm, type CreditTerms } from "./credit-rules";
import { checkSalesRepPick, type SalesRepCandidate } from "./sales-rep-rules";
import { isCreditStatus } from "./shop-lists";
import { checkAreaPick, validateShopMaster, type AreaCandidate, type ShopMaster, type ShopMasterForm } from "./shop-master-rules";

// The phone rules moved to phone-rules.ts (the shop master rules use them too).
export { isValidIndianMobile, normalizePhone };

export type RetailerInput = { name: string; phone: string; place: string };

export type RetailerCheck =
  | { ok: true; value: RetailerInput }
  | { ok: false; errors: Partial<Record<keyof RetailerInput, string>> };

/** Trims and checks the form. Phone is returned as 10 plain digits. */
export function validateRetailer(raw: {
  name?: string | null;
  phone?: string | null;
  place?: string | null;
}): RetailerCheck {
  const name = (raw.name ?? "").trim().replace(/\s+/g, " ");
  const phone = normalizePhone(raw.phone ?? "");
  const place = (raw.place ?? "").trim();
  const errors: Partial<Record<keyof RetailerInput, string>> = {};
  if (!name) errors.name = "Enter a name";
  if (!isValidIndianMobile(phone)) errors.phone = "Enter a 10-digit mobile";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, phone, place } };
}

/** A login (user) the admin created with the retailer role. */
export type RetailerLogin = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string | null;
  banned: boolean | null;
  deletedAt: Date | null;
};

/**
 * Logins admin may link to a shop: retailer role, not deactivated or deleted, and not already
 * linked to another shop. (A shop is added without a login; linking one is a separate, optional step.)
 */
export function pickableRetailerLogins<T extends RetailerLogin>(
  logins: readonly T[],
  linkedUserIds: readonly (string | null)[],
): T[] {
  const taken = new Set(linkedUserIds.filter((id): id is string => id !== null));
  return logins.filter((l) => hasRole(l.role, "retailer") && !l.banned && !l.deletedAt && !taken.has(l.id));
}

/**
 * The Retailers search box: every word typed must appear in the shop's name, place, phone, area or
 * owner name (capitals and spaces do not matter). An empty search matches every shop.
 */
export function matchesRetailerSearch(
  shop: { name: string; place: string; phone: string; areaName?: string | null; ownerName?: string | null },
  query: string,
): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = `${shop.name} ${shop.place} ${shop.phone} ${shop.areaName ?? ""} ${shop.ownerName ?? ""}`.toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

/** What admin changed in the shop sheet. Left out (undefined) = not touched. `userId` null = unlink the login. */
export type ShopEditForm = {
  name: string;
  phone: string;
  place: string;
  salesRepId?: string;
  userId?: string | null;
  /** Owner, contact, location, category, opening date, GSTIN. */
  master?: ShopMasterForm;
  /** Credit limit, days and status (admin, `editCredit`). */
  credit?: CreditForm;
};

/** The facts the server looked up for the edit (inside the transaction, after locking the shop). */
export type ShopEditFacts = {
  /** Another shop already uses the new phone. */
  phoneTaken: boolean;
  /** The sales person picked, if one was picked. */
  salesRep?: SalesRepCandidate;
  /** The login picked, if one was picked. */
  login?: { id: string; role: string | null };
  /** Shops that use the picked login right now. */
  loginLinks: readonly { retailerId: string; userId: string | null }[];
  /** The area picked, if a different one was picked. */
  area?: AreaCandidate;
  /** Today in India (YYYY-MM-DD), for the opening date. */
  today: string;
};

export type ShopEditPlan =
  | {
      ok: true;
      /** Name, phone and place to save (always written; the activity row only when something changed). */
      details: RetailerInput;
      /** The new sales person, or null when it stays the same. */
      salesRepId: string | null;
      /** The new login (null = unlink), or undefined when it stays the same. */
      userId: string | null | undefined;
      /** The cleaned master part, or undefined when the form did not send it. */
      master: ShopMaster | undefined;
      /** The new credit terms and their history row (null = no change), or undefined when not sent. */
      credit: { terms: CreditTerms; change: CreditChange | null } | undefined;
    }
  | { ok: false; error: string };

/**
 * The shop sheet saves everything at once: name, phone and place, its sales person and its login.
 * Every part is checked first; the first problem refuses the whole save (nothing is changed).
 * - Name and phone are required (validateRetailer); the phone must not belong to another shop.
 * - A changed sales person must be an active sales person (an unchanged one is kept even if they left).
 * - A changed login must be a retailer login not linked to another shop; empty unlinks it.
 * - The master part follows validateShopMaster; a changed area must be switched on (an unchanged one is kept).
 * - The credit part follows validateCredit; a history row is planned only when limit, days or status changed.
 * A part left out (undefined) is not touched, so an older form cannot wipe it.
 */
export function planShopEdit(
  shop: {
    id: string;
    salesRepId: string | null;
    userId: string | null;
    areaId?: string | null;
    creditLimitPaise?: number | null;
    creditDays?: number | null;
    creditStatus?: string;
  },
  form: ShopEditForm,
  facts: ShopEditFacts,
): ShopEditPlan {
  const check = validateRetailer(form);
  if (!check.ok) return { ok: false, error: Object.values(check.errors)[0] ?? "Check the form" };
  if (facts.phoneTaken) return { ok: false, error: "Phone already used" };

  let salesRepId: string | null = null;
  if (form.salesRepId && form.salesRepId !== shop.salesRepId) {
    const rep = checkSalesRepPick(form.salesRepId, facts.salesRep);
    if (!rep.ok) return rep;
    salesRepId = form.salesRepId;
  }

  let userId: string | null | undefined = undefined;
  if (form.userId !== undefined && (form.userId || null) !== shop.userId) {
    userId = form.userId || null;
    if (userId) {
      if (!facts.login || facts.login.id !== userId || !hasRole(facts.login.role, "retailer")) {
        return { ok: false, error: "Pick a user with the retailer role." };
      }
      const link = canLinkRetailerUser(userId, shop.id, facts.loginLinks);
      if (!link.ok) return link;
    }
  }

  let master: ShopMaster | undefined = undefined;
  if (form.master !== undefined) {
    const m = validateShopMaster(form.master, { phone: check.value.phone, today: facts.today });
    if (!m.ok) return m;
    const area = checkAreaPick(m.value.areaId, shop.areaId ?? null, facts.area);
    if (!area.ok) return area;
    master = m.value;
  }

  let credit: { terms: CreditTerms; change: CreditChange | null } | undefined = undefined;
  if (form.credit !== undefined) {
    const c = validateCredit(form.credit);
    if (!c.ok) return c;
    const { note, ...terms } = c.value;
    const before: CreditTerms = {
      limitPaise: shop.creditLimitPaise ?? null,
      creditDays: shop.creditDays ?? null,
      status: isCreditStatus(shop.creditStatus) ? shop.creditStatus : "ok",
    };
    credit = { terms, change: creditChange(before, terms, note) };
  }
  return { ok: true, details: check.value, salesRepId, userId, master, credit };
}

/**
 * `?retailer=<id>` prefill: only an id that is in the list this user may pick from counts.
 * Anything else (missing, repeated, unknown, not allowed) is ignored.
 */
export function pickPrefillRetailerId(
  param: string | string[] | undefined,
  allowed: ReadonlyArray<{ id: string }>,
): string | null {
  if (typeof param !== "string" || param === "") return null;
  return allowed.some((r) => r.id === param) ? param : null;
}

/** Picker caption after the shop name: "Patna", or "Patna · Off" for a switched-off shop. */
export function retailerMeta(r: { place: string; active: boolean }): string {
  return [r.place, r.active ? "" : "Off"].filter(Boolean).join(" · ");
}
