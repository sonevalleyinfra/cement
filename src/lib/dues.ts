import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ledgerEntries } from "@/db/schema";
import { summariseDues } from "@/lib/ledger-rules";

/**
 * Retailer dues, read from the ledger. `withFirmPaise` is what the retailer owes
 * this firm; `allFirmsPaise` is the total owed across all firms (advances do not count as negative dues).
 */
export type Dues = { known: false } | { known: true; withFirmPaise: number; allFirmsPaise: number };

export async function getDues(retailerId: string, firmId: string): Promise<Dues> {
  const rows = await db
    .select({
      retailerId: ledgerEntries.retailerId,
      firmId: ledgerEntries.firmId,
      amountPaise: ledgerEntries.amountPaise,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.retailerId, retailerId));
  const s = summariseDues(rows, retailerId, firmId);
  return { known: true, withFirmPaise: s.withFirmPaise, allFirmsPaise: s.allFirmsPaise };
}
