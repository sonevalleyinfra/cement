import { auditLog } from "@/db/schema";
import type { DbOrTx } from "@/lib/ledger";

/** One audit log row to write. */
export type AuditEntry = {
  actorId: string;
  /** Kind of record: "retailer", "vehicle", "godown", "user", "product"... */
  entity: string;
  entityId: string;
  /** What happened: "create", "update", "activate", "deactivate", "link"... */
  action: string;
  /** Extra facts, e.g. the fields that changed. Never put passwords or keys here. */
  details?: Record<string, unknown>;
};

/**
 * Adds one row to the audit log ("who changed what"). Server-only.
 * Pass the open transaction so the log row is saved or lost together with the change.
 * Rows are never edited or deleted.
 */
export async function writeAudit(conn: DbOrTx, entry: AuditEntry): Promise<void> {
  await conn.insert(auditLog).values({
    actorId: entry.actorId,
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
    details: entry.details ?? {},
  });
}
