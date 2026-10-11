/** Rules for the retailers master. Plain functions: no database, no request. */

import { canLinkRetailerUser } from "./rate-rules";
import { hasRole } from "./roles";
import { checkSalesRepPick, type SalesRepCandidate } from "./sales-rep-rules";

/** Keeps digits only, and drops a leading 91 or 0 country/trunk prefix. */
export function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

/** A 10-digit Indian mobile number starts with 6, 7, 8 or 9. */
export function isValidIndianMobile(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone);
}

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
 * The Retailers search box: every word typed must appear in the shop's name, place or phone
 * (capitals and spaces do not matter). An empty search matches every shop.
 */
export function matchesRetailerSearch(shop: { name: string; place: string; phone: string }, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = `${shop.name} ${shop.place} ${shop.phone}`.toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

/** What admin changed in the shop sheet. Left out (undefined) = not touched. `userId` null = unlink the login. */
export type ShopEditForm = {
  name: string;
  phone: string;
  place: string;
  salesRepId?: string;
  userId?: string | null;
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
    }
  | { ok: false; error: string };

/**
 * The shop sheet saves everything at once: name, phone and place, its sales person and its login.
 * Every part is checked first; the first problem refuses the whole save (nothing is changed).
 * - Name and phone are required (validateRetailer); the phone must not belong to another shop.
 * - A changed sales person must be an active sales person (an unchanged one is kept even if they left).
 * - A changed login must be a retailer login not linked to another shop; empty unlinks it.
 */
export function planShopEdit(
  shop: { id: string; salesRepId: string | null; userId: string | null },
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
  return { ok: true, details: check.value, salesRepId, userId };
}
