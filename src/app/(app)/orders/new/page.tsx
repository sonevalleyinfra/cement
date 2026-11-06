import { asc, eq } from "drizzle-orm";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { retailers } from "@/db/schema";
import { getProducts } from "@/lib/catalogue";
import { toISTDateKey } from "@/lib/datetime";
import { defaultOrderSource } from "@/lib/order-delivery-rules";
import { hasScopeTabs } from "@/lib/order-filter-rules";
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
  const columns = {
    id: retailers.id,
    name: retailers.name,
    place: retailers.place,
    phone: retailers.phone,
    address: retailers.address,
    pincode: retailers.pincode,
    salesRepId: retailers.salesRepId,
  };
  const shops = retailerOnly
    ? await db.select(columns).from(retailers).where(eq(retailers.userId, user.id))
    : await db.select(columns).from(retailers).where(eq(retailers.active, true)).orderBy(asc(retailers.name));
  // The sales person's id stays on the server: the form only needs to know whether the shop is this person's.
  const retailerRows = shops.map(({ salesRepId, ...shop }) => ({ ...shop, mine: salesRepId === user.id }));
  const empty = (title: string) => (
    <div className="flex flex-col gap-4">
      <PageHeader title="New order" back="/orders" />
      <EmptyState title={title} />
    </div>
  );
  if (retailerOnly && retailerRows.length === 0) return empty("Your login is not linked to a retailer");
  if (retailerRows.length === 0) return empty("Add a retailer first");
  // With more than one brand, the product list is grouped by brand (see productGroups).
  const productRows = (await getProducts({ activeOnly: true })).map((p) => ({
    id: p.id,
    name: p.name,
    channel: p.channel,
    brand: p.brand,
  }));
  if (productRows.length === 0) return empty("No products yet. Ask admin.");

  return (
    <NewOrderForm
      retailers={retailerRows}
      products={productRows}
      fixedRetailerId={retailerOnly ? retailerRows[0].id : null}
      initialRetailerId={retailerOnly ? null : pickPrefillRetailerId((await searchParams).retailer, retailerRows)}
      askRate={!retailerOnly}
      defaultSource={retailerOnly ? null : defaultOrderSource(user.role)}
      todayKey={toISTDateKey(new Date())}
      groupMine={hasScopeTabs(user.role)}
    />
  );
}
