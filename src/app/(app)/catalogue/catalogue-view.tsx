"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { PinnedAction } from "@/components/app/pinned-action";
import { SelectField } from "@/components/app/select-field";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BAG_SIZES_KG,
  BUSINESS_BRAND,
  CHANNEL_LABELS,
  DEFAULT_BAG_KG,
  PRODUCT_CHANNELS,
  productName,
  type ProductChannel,
} from "@/lib/catalogue-rules";
import {
  addCementType,
  addGrade,
  addProduct,
  type CatalogueList,
  type CatalogueResult,
  setListItemActive,
  setProductActive,
} from "./actions";

type Product = {
  id: string;
  name: string;
  channel: string;
  typeCode: string;
  grade: string;
  bagKg: number;
  active: boolean;
};
type CementType = { id: string; code: string; name: string; active: boolean };
type Grade = { id: string; typeId: string; name: string; active: boolean };

type Tab = "products" | "types";
const TABS: { id: Tab; label: string }[] = [
  { id: "products", label: "Products" },
  { id: "types", label: "Types" },
];

const tabChip = (on: boolean) =>
  `h-11 shrink-0 rounded-full px-4 text-sm font-semibold ring-1 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] ${on ? "bg-primary text-primary-foreground shadow-brand ring-primary" : "bg-card ring-foreground/10"}`;

const rowClass = "flex items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6";

/** One list row with an on/off button. */
function Row({
  title,
  sub,
  active,
  pending,
  onToggle,
}: {
  title: string;
  sub?: string;
  active: boolean;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <li className={rowClass}>
      <div className={active ? "flex flex-col" : "flex flex-col opacity-60"}>
        <span className="font-semibold">{title}</span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
      <Button variant="ghost" disabled={pending} onClick={onToggle}>
        {active ? "Turn off" : "Turn on"}
      </Button>
    </li>
  );
}

export function CatalogueView({
  products,
  types,
  grades,
}: {
  products: Product[];
  types: CementType[];
  grades: Grade[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("products");
  const [sheet, setSheet] = useState<null | "product" | "type" | "grade">(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  // Add-product drop-downs, in order: channel → type → grade → bag size (the brand is always Prism).
  const activeTypes = types.filter((t) => t.active);
  const [channel, setChannel] = useState<ProductChannel>("trade");
  const [typeId, setTypeId] = useState(activeTypes[0]?.id ?? "");
  const [gradeId, setGradeId] = useState("");
  const [bagKg, setBagKg] = useState(String(DEFAULT_BAG_KG));
  const typeGrades = grades.filter((g) => g.typeId === typeId && g.active);
  const preview = (() => {
    const t = types.find((x) => x.id === typeId);
    const g = grades.find((x) => x.id === gradeId);
    return t && g
      ? productName({ brand: BUSINESS_BRAND, channel, typeCode: t.code, grade: g.name, bagKg: Number(bagKg) })
      : "";
  })();

  function run(fn: () => Promise<CatalogueResult>, closeOnOk = false) {
    setError("");
    start(async () => {
      const res = await fn();
      if (res.ok) {
        if (closeOnOk) setSheet(null);
        router.refresh();
      } else setError(res.error);
    });
  }

  function close(isOpen: boolean) {
    if (isOpen) return;
    setSheet(null);
    setError("");
  }

  function open(which: NonNullable<typeof sheet>) {
    setError("");
    setSheet(which);
  }

  function toggleItem(list: CatalogueList, id: string, active: boolean) {
    run(() => setListItemActive(list, id, active));
  }

  function submitText(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "");
    if (sheet === "type") run(() => addCementType({ code: text("code"), name: text("name") }), true);
    if (sheet === "grade") run(() => addGrade({ typeId: text("typeId"), name: text("name") }), true);
  }

  const addLabel = { products: "Add product", types: "Add grade" }[tab];
  const addSheet = ({ products: "product", types: "grade" } as const)[tab];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Catalogue</h1>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tabChip(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {error && !sheet && <p className="text-sm text-destructive">{error}</p>}

      {tab === "products" &&
        (products.length === 0 ? (
          <EmptyState title="No products" />
        ) : (
          PRODUCT_CHANNELS.map((c) => {
            const list = products.filter((p) => p.channel === c);
            if (list.length === 0) return null;
            return (
              <section key={c} className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-muted-foreground">{CHANNEL_LABELS[c]}</h2>
                <ul className="flex flex-col gap-2">
                  {list.map((p) => (
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
            );
          })
        ))}

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
          <Button
            disabled={pending || !typeId || !gradeId}
            onClick={() => run(() => addProduct({ channel, typeId, gradeId, bagKg: Number(bagKg) }), true)}
          >
            Save
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={sheet === "type" || sheet === "grade"}
        onOpenChange={close}
        title={sheet === "type" ? "New type" : "New grade"}
      >
        <form key={sheet ?? "none"} onSubmit={submitText} className="flex flex-col gap-4">
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
