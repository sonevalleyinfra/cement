/**
 * Which sales person looks after a retailer, and so which sales person an order goes to.
 * Plain functions (no database, no request) so they are easy to test.
 *
 * Owner's rule: every retailer is tied to one sales person. All of that shop's orders go
 * to them (they fill the rate and get the shop's order notifications). Only admin changes it.
 *
 * Owner's decisions: only admin adds a shop, and must pick its sales person then (any sales person may
 * still place orders for, and see the dues of, any shop, to cover for a colleague).
 * Choices where the owner was silent (simplest option taken):
 * - An older shop with no sales person: the order goes to the person who placed it if they are
 *   sales, otherwise to nobody; then every admin is told about the new order (notification-rules)
 *   and admin home counts such shops, so nothing gets stuck.
 * - When admin changes a shop's sales person, its unfinished orders move to the new one too,
 *   so nothing gets stuck with someone who no longer looks after the shop. Finished orders
 *   (dispatched, rejected, cancelled) keep the old name for the record.
 */
import { isFinalStatus, isOrderStatus } from "./order-rules";
import { hasRole } from "./roles";

/** The sales person a new order goes to. */
export function orderSalesRep(
  retailerSalesRepId: string | null,
  placer: { id: string; role: string | null | undefined },
): string | null {
  if (retailerSalesRepId) return retailerSalesRepId;
  return hasRole(placer.role, "sales") ? placer.id : null;
}

/** Someone admin might pick as a shop's sales person. */
export type SalesRepCandidate = {
  id: string;
  role: string | null;
  banned: boolean | null;
  deletedAt: Date | null;
};

/** People admin may pick: sales role, not deactivated, not deleted. */
export function pickableSalesReps<T extends SalesRepCandidate>(people: readonly T[]): T[] {
  return people.filter((p) => hasRole(p.role, "sales") && !p.banned && !p.deletedAt);
}

/** Server check before saving a shop's sales person (adding a shop or changing it): one is required. */
export function checkSalesRepPick(
  pickedId: string | null,
  person: SalesRepCandidate | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!pickedId) return { ok: false, error: "Pick a sales person." };
  if (!person || person.id !== pickedId || pickableSalesReps([person]).length === 0) {
    return { ok: false, error: "Pick an active sales person." };
  }
  return { ok: true };
}

/** Orders that move to the new sales person when admin changes the shop's one: the unfinished ones. */
export function movesWithSalesRep(status: string): boolean {
  return isOrderStatus(status) && !isFinalStatus(status);
}
