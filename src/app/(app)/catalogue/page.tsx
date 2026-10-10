import { getCatalogueLists, getProducts } from "@/lib/catalogue";
import { rolesFor } from "@/lib/permissions";
import { requireRole } from "@/lib/session";
import { CatalogueView } from "./catalogue-view";

export default async function CataloguePage() {
  await requireRole(...rolesFor("manageCatalogue"));
  const [productRows, lists] = await Promise.all([getProducts({ activeOnly: false }), getCatalogueLists()]);
  return <CatalogueView products={productRows} types={lists.types} grades={lists.grades} />;
}
