/** Who may see which parts of a receipt. Plain functions: no database, no request. */
import { isRetailerOnly } from "./order-access";

/**
 * Every firm one receipt touches: each firm its money is split to, plus the firm whose
 * bank received it (online / cheque). Each id once, in that order.
 */
export function receiptFirmIds(lineFirmIds: readonly string[], receivedFirmId: string | null | undefined): string[] {
  return [...new Set([...lineFirmIds, ...(receivedFirmId ? [receivedFirmId] : [])])];
}

/** True only if the user may work on every one of the receipt's firms. */
export function mayWorkOnAll(receiptFirms: readonly string[], allowedFirmIds: readonly string[]): boolean {
  const allowed = new Set(allowedFirmIds);
  return receiptFirms.every((id) => allowed.has(id));
}

/**
 * Who is looking at a receipt. `seeAll` is admin or the shop's own retailer login;
 * other staff see only the firms they may work on (`firmIds`).
 */
export type ReceiptViewer = { seeAll: boolean; firmIds: readonly string[] };

/** The firm lines this viewer may see. */
export function visibleReceiptLines<T extends { firmId: string }>(lines: readonly T[], viewer: ReceiptViewer): T[] {
  if (viewer.seeAll) return [...lines];
  const allowed = new Set(viewer.firmIds);
  return lines.filter((l) => allowed.has(l.firmId));
}

/**
 * The "firm A owes firm B" lines this viewer may see: only those for a firm whose line
 * they can already see (B), so no other firm's amount is shown.
 */
export function visibleInterFirm<T extends { owedToFirmId: string }>(owes: readonly T[], viewer: ReceiptViewer): T[] {
  if (viewer.seeAll) return [...owes];
  const allowed = new Set(viewer.firmIds);
  return owes.filter((o) => allowed.has(o.owedToFirmId));
}

/** Why a receipt was reversed, and by whom, is staff information. A shop owner only sees that it was. */
export function showReversalDetails(role: string | null | undefined): boolean {
  return !isRetailerOnly(role);
}
