import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { db } from "@/db";
import { user as users } from "@/db/schema";
import { formatDate, toISTDateKey } from "@/lib/datetime";
import { isUuid } from "@/lib/ids";
import { formatINR } from "@/lib/money";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import {
  SUPPLIER_MODE_LABELS,
  supplierBalanceLabel,
  supplierKindLabel,
  type SupplierPaymentMode,
} from "@/lib/supplier-rules";
import { getBrand, getSupplierBalance, getSupplierEntries, getSuppliers, hasSupplierOpening } from "@/lib/suppliers";
import { SupplierActions } from "./supplier-actions";

/** Most entries shown; the balance always counts all of them. */
const SHOWN = 200;

/** One brand's supplier account: what we owe it, every entry, and the four actions. Admin only. */
export default async function SupplierAccountPage({ params }: { params: Promise<{ brandId: string }> }) {
  await requireRole(...rolesFor("viewSuppliers"));
  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();
  const brand = await getBrand(brandId);
  if (!brand) notFound();
  const [balance, hasOpening, rows, people, suppliers] = await Promise.all([
    getSupplierBalance(brand.id),
    hasSupplierOpening(brand.id),
    getSupplierEntries(brand.id, SHOWN),
    db.select({ id: users.id, name: users.name }).from(users),
    getSuppliers(),
  ]);
  const who = new Map(people.map((u) => [u.id, u.name]));
  const big = supplierBalanceLabel(brand.name, balance);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{brand.name} account</h1>
        {suppliers.length > 1 && (
          <Link href="/suppliers" className="text-sm text-muted-foreground underline">
            Suppliers
          </Link>
        )}
      </div>
      <div className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
        <div className="text-xs text-muted-foreground">{big.text}</div>
        <div className="tabular text-3xl font-bold">{formatINR(big.amountPaise)}</div>
      </div>
      <SupplierActions brandId={brand.id} brandName={brand.name} hasOpening={hasOpening} today={toISTDateKey(new Date())}>
        {rows.length === 0 ? (
          <EmptyState title="No entries yet" />
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((e) => {
              const detail = [
                e.kind === "payment" && e.mode ? SUPPLIER_MODE_LABELS[e.mode as SupplierPaymentMode] : "",
                e.reference,
                e.kind === "opening" ? "" : e.note,
              ].filter(Boolean);
              return (
                <li key={e.id} className="flex flex-col gap-1 rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{supplierKindLabel(e.kind)}</span>
                    <span className={`tabular text-sm font-semibold ${e.amountPaise < 0 ? "text-green-700" : ""}`}>
                      {e.amountPaise < 0 ? "- " : ""}
                      {formatINR(Math.abs(e.amountPaise))}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[formatDate(e.entryDate), ...detail, who.get(e.actorId) ?? ""].filter(Boolean).join(" · ")}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SupplierActions>
    </div>
  );
}
