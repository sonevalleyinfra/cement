import { asc, eq } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { db } from "@/db";
import { retailers } from "@/db/schema";
import { getProducts } from "@/lib/catalogue";
import { isRetailerOnly } from "@/lib/order-access";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { NewOrderForm } from "./new-order-form";

export default async function NewOrderPage() {
  const { user } = await requireRole(...rolesFor("placeOrder"));
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
  const productRows = (await getProducts({ activeOnly: true })).map((p) => ({ id: p.id, name: p.name, channel: p.channel }));
  if (productRows.length === 0) return <EmptyState title="No products yet. Ask admin." />;

  return (
    <NewOrderForm
      retailers={retailerRows}
      products={productRows}
      fixedRetailerId={retailerOnly ? retailerRows[0].id : null}
    />
  );
}
