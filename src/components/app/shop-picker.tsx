"use client";

import { ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Sheet } from "@/components/app/sheet";
import { Input } from "@/components/ui/input";
import { matchesRetailerSearch } from "@/lib/retailer-rules";

type Shop = { id: string; name: string; place: string; phone: string };

/**
 * A shop picker inside a GET form (e.g. `RangeForm`): a 48px button opens a sheet with search
 * (name, place or phone). Picking a shop sets the hidden `name` field and sends the form at once.
 */
export function ShopPicker({
  name,
  label,
  shops,
  value,
  placeholder = "Pick a retailer",
}: {
  name: string;
  label: string;
  shops: Shop[];
  value: string;
  placeholder?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState(value);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const shop = shops.find((s) => s.id === picked);
  const shown = shops.filter((s) => matchesRetailerSearch(s, search));

  function pick(shopId: string) {
    setPicked(shopId);
    setOpen(false);
    setSearch("");
    if (input.current) {
      input.current.value = shopId;
      input.current.form?.requestSubmit();
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span id={id} className="text-sm font-medium">
        {label}
      </span>
      <input ref={input} type="hidden" name={name} defaultValue={value} />
      <button
        type="button"
        aria-labelledby={id}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex h-12 w-full min-w-0 items-center justify-between gap-2 rounded-xl border bg-background px-3 text-left text-base"
      >
        <span className={shop ? "truncate" : "truncate text-muted-foreground"}>{shop ? shop.name : placeholder}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={label}>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          aria-label="Search shops"
          autoComplete="off"
          className="mb-3"
        />
        <ul className="flex flex-col gap-2">
          {shown.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => pick(s.id)}
                aria-current={s.id === picked ? "true" : undefined}
                className="flex min-h-12 w-full flex-col items-start rounded-2xl bg-card px-4 py-2 text-left shadow-card ring-1 ring-foreground/6"
              >
                <span className="font-semibold">{s.name}</span>
                {s.place && <span className="text-xs text-muted-foreground">{s.place}</span>}
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="py-6 text-center text-muted-foreground">No match</li>}
        </ul>
      </Sheet>
    </div>
  );
}
