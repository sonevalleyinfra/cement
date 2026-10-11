"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { chipClass } from "@/components/app/chip";
import { EmptyState } from "@/components/app/empty-state";
import { FormHint } from "@/components/app/form-hint";
import { PinnedAction } from "@/components/app/pinned-action";
import { SelectField } from "@/components/app/select-field";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BAG_SIZES_KG,
  CHANNEL_LABELS,
  DEFAULT_BAG_KG,
  hasManyBrands,
  PRODUCT_CHANNELS,
  productName,
  startBrand,
  type ProductChannel,
} from "@/lib/catalogue-rules";
import { firstMissing } from "@/lib/form-rules";
import { useFormError } from "@/lib/use-form-error";
import {
  addBrand,
  addCementType,
  addGrade,
  addProduct,
  type CatalogueList,
  type CatalogueResult,
  renameListItem,
  setListItemActive,
  setProductActive,
} from "./actions";

type Product = {
  id: string;
  name: string;
  brandId: string;
  brand: string;
  channel: string;
  typeCode: string;
  grade: string;
  bagKg: number;
  active: boolean;
};
type Brand = { id: string; name: string; active: boolean };
type CementType = { id: string; code: string; name: string; active: boolean };
type Grade = { id: string; typeId: string; name: string; active: boolean };

type Tab = "products" | "brands" | "types";
const TABS: { id: Tab; label: string }[] = [
  { id: "products", label: "Products" },
  { id: "brands", label: "Brands" },
  { id: "types", label: "Types" },
];

const rowClass = "flex items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6";

/** One list row with an on/off button (and an optional rename button). */
function Row({
  title,
  sub,
  active,
  pending,
  onToggle,
  onRename,
}: {
  title: string;
  sub?: string;
  active: boolean;
  pending: boolean;
  onToggle: () => void;
  onRename?: () => void;
}) {
  return (
    <li className={rowClass}>
      <div className={active ? "flex min-w-0 flex-1 flex-col" : "flex min-w-0 flex-1 flex-col opacity-60"}>
        <span className="truncate font-semibold">{title}</span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
      {onRename && (
        <Button variant="ghost" size="icon" aria-label={`Rename ${title}`} disabled={pending} onClick={onRename}>
          <Pencil className="size-4" />
        </Button>
      )}
      <Button variant="ghost" disabled={pending} onClick={onToggle}>
        {active ? "Turn off" : "Turn on"}
      </Button>
    </li>
  );
}

export function CatalogueView({
  products,
  brands,
  types,
  grades,
}: {
  products: Product[];
  brands: Brand[];
  types: CementType[];
  grades: Grade[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("products");
  const [sheet, setSheet] = useState<null | "product" | "brand" | "type" | "grade">(null);
  // The brand being renamed (its sheet is open while this is set).
  const [renaming, setRenaming] = useState<Brand | null>(null);
  const [pending, start] = useTransition();

  // Add-product drop-downs, in order: brand → channel → type → grade → bag size.
  // With one switched-on brand there is no Brand drop-down: that brand is used.
  const activeBrands = brands.filter((b) => b.active);
  const [brandPick, setBrandPick] = useState("");
  const brandId = startBrand(activeBrands, brandPick);
  const activeTypes = types.filter((t) => t.active);
  const [channel, setChannel] = useState<ProductChannel>("trade");
  const [typeId, setTypeId] = useState(activeTypes[0]?.id ?? "");
  const [gradeId, setGradeId] = useState("");
  const [bagKg, setBagKg] = useState(String(DEFAULT_BAG_KG));
  const typeGrades = grades.filter((g) => g.typeId === typeId && g.active);
  // The error goes away when a drop-down changes; the text sheets are read with FormData (onInput clears it).
  const { error, setError, clearError } = useFormError([brandId, channel, typeId, gradeId, bagKg]);
  const productHint = firstMissing([
    [activeBrands.length === 0, "Add a brand first"],
    [!typeId, "Pick a type"],
    [!gradeId, "Pick a grade"],
  ]);
  const preview = (() => {
    const b = brands.find((x) => x.id === brandId);
    const t = types.find((x) => x.id === typeId);
    const g = grades.find((x) => x.id === gradeId);
    return b && t && g
      ? productName({ brand: b.name, channel, typeCode: t.code, grade: g.name, bagKg: Number(bagKg) })
      : "";
  })();
  // Products in Trade / Non-trade sections, per brand when there is more than one brand.
  const brandNames = [...new Set(products.map((p) => p.brand))];
  const sections = brandNames
    .flatMap((brand) =>
      PRODUCT_CHANNELS.map((c) => ({
        key: `${brand}-${c}`,
        label: hasManyBrands(brandNames) ? `${brand} · ${CHANNEL_LABELS[c]}` : CHANNEL_LABELS[c],
        list: products.filter((p) => p.channel === c && p.brand === brand),
      })),
    )
    .filter((sec) => sec.list.length > 0);

  function run(fn: () => Promise<CatalogueResult>, closeOnOk = false) {
    clearError();
    start(async () => {
      const res = await fn();
      if (res.ok) {
        clearError();
        if (closeOnOk) setSheet(null);
        router.refresh();
      } else setError(res.error);
    });
  }

  function close(isOpen: boolean) {
    if (isOpen) return;
    setSheet(null);
    setRenaming(null);
    clearError();
  }

  function open(which: NonNullable<typeof sheet>) {
    clearError();
    setSheet(which);
  }

  function toggleItem(list: CatalogueList, id: string, active: boolean) {
    run(() => setListItemActive(list, id, active));
  }

  function submitText(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "");
    if (sheet === "brand" && renaming) {
      run(async () => {
        const res = await renameListItem("brand", renaming.id, { name: text("name") });
        if (res.ok) setRenaming(null);
        return res;
      }, true);
    } else if (sheet === "brand") run(() => addBrand(text("name")), true);
    if (sheet === "type") run(() => addCementType({ code: text("code"), name: text("name") }), true);
    if (sheet === "grade") run(() => addGrade({ typeId: text("typeId"), name: text("name") }), true);
  }

  const addLabel = { products: "Add product", brands: "Add brand", types: "Add grade" }[tab];
  const addSheet = ({ products: "product", brands: "brand", types: "grade" } as const)[tab];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Catalogue</h1>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={chipClass(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {error && !sheet && <p className="text-sm text-destructive">{error}</p>}

      {tab === "products" &&
        (products.length === 0 ? (
          <EmptyState title="No products" />
        ) : (
          sections.map((sec) => (
            <section key={sec.key} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{sec.label}</h2>
              <ul className="flex flex-col gap-2">
                {sec.list.map((p) => (
                  <Row
                    key={p.id}
                    title={p.name}
                    sub={`${p.typeCode} ${p.grade} · ${p.bagKg} kg`}
                    active={p.active}
                    pending={pending}
                    onToggle={() => run(() => setProductActive(p.id, !p.active))}
                  />
                ))}
              </ul>
            </section>
          ))
        ))}

      {tab === "brands" && (
        <ul className="flex flex-col gap-2">
          {brands.map((b) => {
            const count = products.filter((p) => p.brandId === b.id && p.active).length;
            return (
              <Row
                key={b.id}
                title={b.name}
                sub={`${count} ${count === 1 ? "product" : "products"} on`}
                active={b.active}
                pending={pending}
                onToggle={() => toggleItem("brand", b.id, !b.active)}
                onRename={() => {
                  clearError();
                  setRenaming(b);
                  setSheet("brand");
                }}
              />
            );
          })}
        </ul>
      )}

      {tab === "types" && (
        <div className="flex flex-col gap-4">
          {types.map((t) => (
            <section key={t.id} className="flex flex-col gap-2">
              <ul className="flex flex-col gap-2">
                <Row
                  title={t.code}
                  sub={t.name}
                  active={t.active}
                  pending={pending}
                  onToggle={() => toggleItem("cement_type", t.id, !t.active)}
                />
              </ul>
              <ul className="flex flex-col gap-2 pl-4">
                {grades
                  .filter((g) => g.typeId === t.id)
                  .map((g) => (
                    <Row
                      key={g.id}
                      title={`${t.code} ${g.name}`}
                      active={g.active}
                      pending={pending}
                      onToggle={() => toggleItem("grade", g.id, !g.active)}
                    />
                  ))}
              </ul>
            </section>
          ))}
          <Button variant="outline" onClick={() => open("type")}>
            Add type
          </Button>
        </div>
      )}

      <PinnedAction>
        <Button onClick={() => open(addSheet)}>{addLabel}</Button>
      </PinnedAction>

      <Sheet open={sheet === "product"} onOpenChange={close} title="New product">
        <div className="flex flex-col gap-4">
          {hasManyBrands(activeBrands) && (
            <SelectField
              label="Brand"
              value={brandId}
              onChange={setBrandPick}
              options={activeBrands.map((b) => ({ value: b.id, label: b.name }))}
            />
          )}
          <SelectField
            label="Trade / Non-trade"
            value={channel}
            onChange={(v) => setChannel(v as ProductChannel)}
            options={PRODUCT_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABELS[c] }))}
          />
          <SelectField
            label="Type"
            value={typeId}
            onChange={(v) => {
              setTypeId(v);
              setGradeId("");
            }}
            options={activeTypes.map((t) => ({ value: t.id, label: t.name ? `${t.code} · ${t.name}` : t.code }))}
          />
          <SelectField
            label="Grade"
            value={gradeId}
            onChange={setGradeId}
            placeholder="Pick a grade"
            options={typeGrades.map((g) => ({ value: g.id, label: g.name }))}
          />
          <SelectField
            label="Bag size"
            value={bagKg}
            onChange={setBagKg}
            options={BAG_SIZES_KG.map((kg) => ({ value: String(kg), label: `${kg} kg` }))}
          />
          {preview && <p className="text-base font-semibold">{preview}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div>
            <FormHint>{productHint}</FormHint>
            <Button
              className="w-full"
              disabled={pending || productHint !== null || !brandId}
              onClick={() => run(() => addProduct({ brandId, channel, typeId, gradeId, bagKg: Number(bagKg) }), true)}
            >
              Save
            </Button>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={sheet === "brand" || sheet === "type" || sheet === "grade"}
        onOpenChange={close}
        title={sheet === "brand" ? (renaming ? "Rename brand" : "New brand") : sheet === "type" ? "New type" : "New grade"}
      >
        <form
          key={`${sheet ?? "none"}-${renaming?.id ?? ""}`}
          onSubmit={submitText}
          onInput={clearError}
          className="flex flex-col gap-4"
        >
          {sheet === "brand" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Brand name</Label>
              <Input
                id="name"
                name="name"
                autoComplete="off"
                placeholder="UltraTech"
                defaultValue={renaming?.name ?? ""}
                maxLength={40}
              />
            </div>
          )}
          {sheet === "type" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">Code</Label>
                <Input id="code" name="code" autoComplete="off" autoCapitalize="characters" placeholder="PSC" maxLength={10} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Full name (optional)</Label>
                <Input id="name" name="name" autoComplete="off" placeholder="Portland Slag Cement" maxLength={60} />
              </div>
            </>
          )}
          {sheet === "grade" && <GradeFields types={activeTypes} />}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>
            Save
          </Button>
        </form>
      </Sheet>
    </div>
  );
}

/** Type drop-down + grade name for a new grade. */
function GradeFields({ types }: { types: CementType[] }) {
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  return (
    <>
      <SelectField label="Type" value={typeId} onChange={setTypeId} options={types.map((t) => ({ value: t.id, label: t.code }))} />
      <input type="hidden" name="typeId" value={typeId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Grade</Label>
        <Input id="name" name="name" autoComplete="off" placeholder="53" maxLength={20} />
      </div>
    </>
  );
}
