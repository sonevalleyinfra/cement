import { asc, eq } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { getFirmSelection } from "@/components/app/firm-switcher";
import { db } from "@/db";
import { products, retailers } from "@/db/schema";
import { isRetailerOnly } from "@/lib/order-access";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { NewOrderForm } from "./new-order-form";

export default async function NewOrderPage() {
  const { user } = await requireRole(...rolesFor("placeOrder"));
  const { firms, selection } = await getFirmSelection();
  if (selection.mode !== "firm") return <EmptyState title="Pick one firm to place an order" />;
  const firm = firms.find((f) => f.id === selection.firmId);
  if (!firm) return <EmptyState title="Pick one firm to place an order" />;

  const retailerOnly = isRetailerOnly(user.role);
  const retailerRows = retailerOnly
    ? await db
        .select({ id: retailers.id, name: retailers.name, place: retailers.place })
        .from(retailers)
        .where(eq(retailers.userId, user.id))
    : await db
        .select({ id: retailers.id, name: retailers.name, place: retailers.place })
        .from(retailers)
        .where(eq(retailers.active, true))
        .orderBy(asc(retailers.name));
  if (retailerOnly && retailerRows.length === 0) {
    return <EmptyState title="Your login is not linked to a retailer" />;
  }
  if (retailerRows.length === 0) return <EmptyState title="Add a retailer first" />;
  const productRows = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.active, true))
    .orderBy(asc(products.name));
  if (productRows.length === 0) return <EmptyState title="No products yet. Ask admin." />;

  return (
    <NewOrderForm
      firmId={selection.firmId}
      firmName={firm.name}
      retailers={retailerRows}
      products={productRows}
      fixedRetailerId={retailerOnly ? retailerRows[0].id : null}
    />
  );
}
