"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TruckInput = { number: string; driverName: string; driverPhone: string };

/** The quick truck form for a hired truck: number, driver, phone (purchase and move bags). */
export function TruckFields({ value, onChange }: { value: TruckInput; onChange: (next: TruckInput) => void }) {
  const id = useId();
  return (
    <div className="animate-in-up flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-number`}>Truck number</Label>
        <Input
          id={`${id}-number`}
          value={value.number}
          onChange={(e) => onChange({ ...value, number: e.target.value.toUpperCase() })}
          placeholder="BR01AB1234"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={14}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-driver`}>Driver name</Label>
        <Input
          id={`${id}-driver`}
          value={value.driverName}
          onChange={(e) => onChange({ ...value, driverName: e.target.value })}
          autoComplete="off"
          maxLength={80}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-phone`}>Driver phone (optional)</Label>
        <Input
          id={`${id}-phone`}
          value={value.driverPhone}
          onChange={(e) => onChange({ ...value, driverPhone: e.target.value })}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          maxLength={14}
        />
      </div>
    </div>
  );
}
