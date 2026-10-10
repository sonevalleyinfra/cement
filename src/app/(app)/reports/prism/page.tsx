import { permanentRedirect } from "next/navigation";
import { param } from "@/lib/report-range";

/** The Prism statement became the supplier statement (one per brand). Old links keep their dates. */
export default async function OldPrismStatementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const key of ["from", "to"]) {
    const v = param(sp[key]);
    if (v) q.set(key, v);
  }
  const s = q.toString();
  permanentRedirect(s ? `/reports/suppliers?${s}` : "/reports/suppliers");
}
