/**
 * Retailer dues. The ledger does not exist yet (task 12), so for now every
 * lookup returns "unknown". When the ledger is built, replace `getDues` only;
 * the approvals screen already shows whatever this returns.
 */
export type Dues = { known: false } | { known: true; withFirmPaise: number; allFirmsPaise: number };

export async function getDues(retailerId: string, firmId: string): Promise<Dues> {
  void [retailerId, firmId];
  return { known: false };
}
