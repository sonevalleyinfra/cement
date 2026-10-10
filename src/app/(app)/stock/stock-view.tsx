"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { chipClass } from "@/components/app/chip";
import { EmptyState } from "@/components/app/empty-state";
import { SelectField } from "@/components/app/select-field";
import { Stat } from "@/components/app/stat";
import { CHANNEL_LABELS, formatTonnes, hasManyBrands, PRODUCT_CHANNELS, type ProductChannel } from "@/lib/catalogue-rules";
import {
  brandNames,
  NO_FILTERS,
  stockByPlace,
  stockByProduct,
  stockTotal,
  typeCodes,
  type StockFilters,
  type StockProduct,
  type StockRow,
} from "@/lib/stock-view-rules";
import { formatCount } from "@/lib/words";

type View = "product" | "place";

const cardClass = "flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6";

function Line({ label, bags }: { label: string; bags: number }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="tabular font-semibold">{formatCount(bags)}</span>
    </div>
  );
}

/** Stock by product or by place, with brand (when more than one), Trade / Non-trade and type filters. */
export function StockView({ products, rows }: { products: StockProduct[]; rows: StockRow[] }) {
  // The view lives in the address (/stock?view=place), so a link can open it and the back button works.
  const view: View = useSearchParams().get("view") === "place" ? "place" : "product";
  function setView(next: View) {
    const params = new URLSearchParams(window.location.search);
    if (next === "place") params.set("view", "place");
    else params.delete("view");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }
  const [filters, setFilters] = useState<StockFilters>(NO_FILTERS);
  const total = stockTotal(rows, products, filters);
  const placeLabel = (kind: string, name: string) => (kind === "vehicle" ? `Truck ${name}` : name);
  const brands = brandNames(rows, products);

  const bySection = view === "product" ? stockByProduct(rows, products, filters) : [];
  const byPlace = view === "place" ? stockByPlace(rows, products, filters) : [];
  const empty = view === "product" ? bySection.length === 0 : byPlace.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2" role="tablist" aria-label="View">
        <button type="button" role="tab" aria-selected={view === "product"} className={chipClass(view === "product", "flex-1")} onClick={() => setView("product")}>
          By product
        </button>
        <button type="button" role="tab" aria-selected={view === "place"} className={chipClass(view === "place", "flex-1")} onClick={() => setView("place")}>
          By place
        </button>
      </div>
      {hasManyBrands(brands) && (
        <SelectField
          label="Brand"
          value={filters.brand}
          onChange={(v) => setFilters({ ...filters, brand: v })}
          options={[{ value: "all", label: "All" }, ...brands.map((b) => ({ value: b, label: b }))]}
        />
      )}
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="Trade / Non-trade"
          value={filters.channel}
          onChange={(v) => setFilters({ ...filters, channel: v as "all" | ProductChannel })}
          options={[{ value: "all", label: "All" }, ...PRODUCT_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABELS[c] }))]}
        />
        <SelectField
          label="Type"
          value={filters.typeCode}
          onChange={(v) => setFilters({ ...filters, typeCode: v })}
          options={[{ value: "all", label: "All" }, ...typeCodes(products).map((t) => ({ value: t, label: t }))]}
        />
      </div>
      <div className={`${cardClass} grid grid-cols-2`}>
        <Stat label="Bags" value={formatCount(total.bags)} />
        <Stat label="Weight" value={formatTonnes(total.kg)} />
      </div>

      {empty && <EmptyState title="No stock" />}

      {bySection.map((s) => (
        <section key={s.label} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{s.label}</h2>
          <ul className="flex flex-col gap-3">
            {s.items.map((i) => (
              <li key={i.product.id} className={cardClass}>
                <div className="flex items-end justify-between gap-3">
                  <Stat label={i.product.name} value={`${formatCount(i.bags)} bags`} />
                  <span className="tabular text-sm text-muted-foreground">{formatTonnes(i.kg)}</span>
                </div>
                {i.places.map((p) => (
                  <Line key={p.key} label={placeLabel(p.kind, p.name)} bags={p.bags} />
                ))}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {byPlace.length > 0 && (
        <ul className="flex flex-col gap-3">
          {byPlace.map((c) => (
            <li key={c.key} className={cardClass}>
              <div className="flex items-end justify-between gap-3">
                <Stat label={placeLabel(c.kind, c.name)} value={`${formatCount(c.bags)} bags`} />
                <span className="tabular text-sm text-muted-foreground">{formatTonnes(c.kg)}</span>
              </div>
              {c.lines.map((l) => (
                <Line key={l.product.id} label={l.product.name} bags={l.bags} />
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
