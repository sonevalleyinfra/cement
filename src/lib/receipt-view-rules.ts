/** Who may see which parts of a receipt. Plain functions: no database, no request. */
import { isStaff } from "./permissions";

/**
 * Who recorded, checked or reversed a payment, the note and every reason are staff information.
 * A shop owner sees only the amount, mode, UTR, date and status.
 */
export function showStaffDetails(role: string | null | undefined): boolean {
  return isStaff(role);
}
