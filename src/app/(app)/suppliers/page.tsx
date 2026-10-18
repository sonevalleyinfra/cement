import { Factory } from "lucide-react";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { IconTile } from "@/components/app/icon-tile";
import { ListCard } from "@/components/app/list-card";
import { PageHeader } from "@/components/app/page-header";
import { Stat } from "@/components/app/stat";
import { formatINR } from "@/lib/money";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { supplierBalanceLabel } from "@/lib/supplier-rules";
import { getSuppliers } from "@/lib/suppliers";

/**
 * Suppliers: one account per brand, each with what we owe it. Tap one to open its account.
 * With only one supplier (Prism today) this page goes straight to its account. Admin only.
 */
export default async function SuppliersPage() {
  await requireRole(...rolesFor("viewSuppliers"));
  const suppliers = await getSuppliers();
  if (suppliers.length === 1) redirect(`/suppliers/${suppliers[0].id}`);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Suppliers" />
      {suppliers.length === 0 ? (
        <EmptyState title="Add a brand in Catalogue" icon={Factory} tone="amber" />
      ) : (
        <div className="flex flex-col gap-3">
          {suppliers.map((s, i) => {
            const big = supplierBalanceLabel(s.name, s.balancePaise);
            return (
              <ListCard
                key={s.id}
                href={`/suppliers/${s.id}`}
                index={i}
                title={s.active ? s.name : `${s.name} (off)`}
                icon={<IconTile icon={Factory} tone="amber" />}
                bottom={<Stat label={big.text} value={formatINR(big.amountPaise)} />}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
