/** Who may see which parts of a receipt. Plain functions: no database, no request. */
import { isRetailerOnly } from "./order-access";

/** Why a receipt was reversed, and by whom, is staff information. A shop owner only sees that it was. */
export function showReversalDetails(role: string | null | undefined): boolean {
  return !isRetailerOnly(role);
}
