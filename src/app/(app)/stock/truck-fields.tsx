"use client";

import { Input } from "@/components/ui/input";

export type TruckInput = { number: string; driverName: string; driverPhone: string };

/** The quick truck form for a hired truck: number, driver, phone (purchase and move bags). */
export function TruckFields({ value, onChange }: { value: TruckInput; onChange: (next: TruckInput) => void }) {
  return (
    <div className="animate-in-up flex flex-col gap-2 rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6">
      <Input
        value={value.number}
        onChange={(e) => onChange({ ...value, number: e.target.value.toUpperCase() })}
        placeholder="Truck number, e.g. BR01AB1234"
        aria-label="Truck number"
        autoCapitalize="characters"
        autoComplete="off"
        maxLength={14}
      />
      <Input
        value={value.driverName}
        onChange={(e) => onChange({ ...value, driverName: e.target.value })}
        placeholder="Driver name"
        aria-label="Driver name"
        maxLength={80}
      />
      <Input
        value={value.driverPhone}
        onChange={(e) => onChange({ ...value, driverPhone: e.target.value })}
        placeholder="Driver phone (optional)"
        aria-label="Driver phone"
        inputMode="tel"
        maxLength={14}
      />
    </div>
  );
}
