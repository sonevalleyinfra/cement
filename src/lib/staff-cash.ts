/**
 * Server-only. Cash held by a staff member vs switching that person off (deactivate, delete, losing
 * every staff role). Spec (docs/idea.md): someone holding cash cannot be switched off until it is
 * handed over, and a switched-off person cannot take new cash.
 *
 * The race: a payment saved between "check the cash" and "ban" would leave cash on a switched-off
 * person. So both sides lock the person's `user` row in their own transaction and decide on what
 * they read after the lock:
 * - recording a payment / asking for a handover: lockCashRecorder (refused once switched off);
 * - deactivate / delete: lock first, then read the wallet and write the ban in the same transaction.
 * Lock order everywhere: payment row → retailer row → staff (user) row.
 *
 * Every function takes the open transaction and never imports `@/db` or `@/env`, so the race test
 * (staff-cash.db.test.ts) can run them on its own connection pool.
 */
import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { ledgerEntries, retailers, session, user, walletMovements } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import {
  checkCashHeld,
  checkCashRecorder,
  checkDelete,
  checkShopsOwned,
  shopsToHandOver,
} from "@/lib/user-admin-rules";
import { walletBalance } from "@/lib/wallet-rules";

/** An open transaction (or a database) on the app's schema. */
export type StaffTx = Pick<PostgresJsDatabase<typeof schema>, "select" | "insert" | "update" | "delete">;

export type StaffResult = { ok: true } | { ok: false; error: string };

/** The ban reason Better Auth's admin plugin would have saved for us. */
export const DEACTIVATED_REASON = "Deactivated by admin";

/**
 * Locks one person's row until the transaction ends (`for no key update`, the same lock the wallet
 * and reversal code take). Returns the row, or null when there is no such user.
 */
export async function lockStaff(tx: StaffTx, userId: string) {
  const [row] = await tx
    .select({ id: user.id, name: user.name, email: user.email, role: user.role, banned: user.banned, deletedAt: user.deletedAt })
    .from(user)
    .where(eq(user.id, userId))
    .for("no key update");
  return row ?? null;
}

/** The cash this person holds now, read inside the transaction (handovers still waiting count as held). */
export async function heldCashOf(tx: StaffTx, userId: string): Promise<number> {
  const rows = await tx
    .select({ id: walletMovements.id, kind: walletMovements.kind, amountPaise: walletMovements.amountPaise, refId: walletMovements.refId })
    .from(walletMovements)
    .where(eq(walletMovements.collectorId, userId));
  return walletBalance(rows).balancePaise;
}

/**
 * Locks the person about to take cash (a payment) or ask to hand it over, and checks on that locked
 * row that they are still switched on and still have the role. Call it after locking the retailer.
 */
export async function lockCashRecorder(
  tx: StaffTx,
  userId: string,
  permission: "recordReceipt" | "useWallet",
): Promise<StaffResult> {
  const problem = checkCashRecorder(await lockStaff(tx, userId), permission);
  return problem ? { ok: false, error: problem } : { ok: true };
}

/** The sales person's shops that someone else must take first (switched on, or off and still owing). */
async function shopsLeftWith(tx: StaffTx, userId: string): Promise<number> {
  const shops = await tx
    .select({
      active: retailers.active,
      balancePaise: sql<number>`coalesce(sum(${ledgerEntries.amountPaise}), 0)`.mapWith(Number),
    })
    .from(retailers)
    .leftJoin(ledgerEntries, eq(ledgerEntries.retailerId, retailers.id))
    .where(eq(retailers.salesRepId, userId))
    .groupBy(retailers.id, retailers.active);
  return shopsToHandOver(shops);
}

/**
 * Deactivates someone in one transaction: lock their row, check they hold no cash and leave no
 * shops behind, then ban them, end their sessions and write the activity row. All or nothing.
 *
 * The ban is written here, the same way Better Auth's admin `banUser` does it (banned, reason, no
 * expiry, then delete every session row). Calling `auth.api.banUser` instead would use another pool
 * connection and wait forever on the lock this transaction holds. No session cookie cache is set up
 * (src/lib/auth.ts), so deleting the session rows signs them out at once.
 */
export async function deactivateStaff(tx: StaffTx, input: { actorId: string; userId: string }): Promise<StaffResult> {
  const person = await lockStaff(tx, input.userId);
  if (!person || person.deletedAt) return { ok: false, error: "User not found." };
  const problem = checkCashHeld(await heldCashOf(tx, input.userId)) ?? checkShopsOwned(await shopsLeftWith(tx, input.userId));
  if (problem) return { ok: false, error: problem };
  await tx
    .update(user)
    .set({ banned: true, banReason: DEACTIVATED_REASON, banExpires: null, updatedAt: new Date() })
    .where(eq(user.id, input.userId));
  await tx.delete(session).where(eq(session.userId, input.userId));
  await writeAudit(tx, { actorId: input.actorId, entity: "user", entityId: input.userId, action: "deactivate" });
  return { ok: true };
}

/** Switches someone back on (lifts the ban, like Better Auth's `unbanUser`) with its activity row. */
export async function reactivateStaff(tx: StaffTx, input: { actorId: string; userId: string }): Promise<StaffResult> {
  const person = await lockStaff(tx, input.userId);
  if (!person || person.deletedAt) return { ok: false, error: "User not found." };
  await tx
    .update(user)
    .set({ banned: false, banReason: null, banExpires: null, updatedAt: new Date() })
    .where(eq(user.id, input.userId));
  await writeAudit(tx, { actorId: input.actorId, entity: "user", entityId: input.userId, action: "activate" });
  return { ok: true };
}

/**
 * "Deletes" a deactivated user (marks them deleted; nothing is erased) in one transaction: lock
 * their row, check on that row that they are deactivated, check they hold no cash, then mark them.
 */
export async function deleteStaff(
  tx: StaffTx,
  input: { actorId: string; userId: string; isSelf: boolean },
): Promise<StaffResult> {
  const person = await lockStaff(tx, input.userId);
  if (!person || person.deletedAt) return { ok: false, error: "User not found." };
  const problem = checkDelete(input.isSelf, !person.banned) ?? checkCashHeld(await heldCashOf(tx, input.userId));
  if (problem) return { ok: false, error: problem };
  const now = new Date();
  await tx
    .update(user)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(user.id, input.userId));
  await writeAudit(tx, {
    actorId: input.actorId,
    entity: "user",
    entityId: input.userId,
    action: "delete",
    details: { name: person.name, email: person.email },
  });
  return { ok: true };
}
