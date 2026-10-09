/**
 * Retailer dues. The ledger does not exist yet (task 12), so for now every
 * lookup returns "unknown". When the ledger is built, replace `getDues` only;
 * the approvals screen already shows whatever this returns.
 */
export type Dues = { known: false } | { known: true; withFirmPaise: number; allFirmsPaise: number };

export async function getDues(_retailerId: string, _firmId: string): Promise<Dues> {
  return { known: false };
}
