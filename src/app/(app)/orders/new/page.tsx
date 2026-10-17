import { asc, eq } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { db } from "@/db";
import { retailers } from "@/db/schema";
import { getProducts } from "@/lib/catalogue";
import { pickPrefillRetailerId } from "@/lib/retailer-rules";
import { isStaff, rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { NewOrderForm } from "./new-order-form";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireRole(...rolesFor("placeOrder"));
  // Staff pick any active shop and type the rate; a retailer orders for their own shop only.
  const retailerOnly = !isStaff(user.role);
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
  // With more than one brand, the product list is grouped by brand (see productGroups).
  const productRows = (await getProducts({ activeOnly: true })).map((p) => ({
    id: p.id,
    name: p.name,
    channel: p.channel,
    brand: p.brand,
  }));
  if (productRows.length === 0) return <EmptyState title="No products yet. Ask admin." />;

  return (
    <NewOrderForm
      retailers={retailerRows}
      products={productRows}
      fixedRetailerId={retailerOnly ? retailerRows[0].id : null}
      initialRetailerId={retailerOnly ? null : pickPrefillRetailerId((await searchParams).retailer, retailerRows)}
      askRate={!retailerOnly}
    />
  );
}
