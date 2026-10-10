import { auditLog } from "@/db/schema";
import { isAllowedAudit, type AuditKind } from "@/lib/audit-rules";
import type { DbOrTx } from "@/lib/ledger";

/**
 * One activity log row to write. `entity` + `action` must be one of the pairs in
 * AUDIT_ACTIONS (audit-rules.ts); the type checker refuses anything else.
 */
export type AuditEntry = AuditKind & {
  actorId: string;
  entityId: string;
  /** Extra facts: ids, paise, bags, reason (see audit-rules.ts). Never put passwords or keys here. */
  details?: Record<string, unknown>;
};

/**
 * Adds one row to the activity log ("who did what, when"). Server-only.
 * Pass the open transaction so the log row is saved or lost together with the change.
 * Rows are never edited or deleted.
 */
export async function writeAudit(conn: DbOrTx, entry: AuditEntry): Promise<void> {
  if (!isAllowedAudit(entry.entity, entry.action)) {
    throw new Error(`Unknown activity: ${entry.entity} ${entry.action}`);
  }
  await conn.insert(auditLog).values({
    actorId: entry.actorId,
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
    details: entry.details ?? {},
  });
}
