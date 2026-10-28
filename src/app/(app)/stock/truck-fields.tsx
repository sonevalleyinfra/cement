"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TruckInput = { number: string; driverName: string; driverPhone: string };

/**
 * The quick truck form: number, driver, phone (purchase and move bags). The phone is required
 * unless `phoneOptional` (moving bags). With `fixedNumber` (a purchase into a truck already in the
 * list) the number is shown as text instead of typed.
 * Auto-fills driver name and phone when a known truck number is selected.
 */
export function TruckFields({
  value,
  onChange,
  phoneOptional = false,
  fixedNumber,
  knownTrucks = [],
}: {
  value: TruckInput;
  onChange: (next: TruckInput) => void;
  phoneOptional?: boolean;
  fixedNumber?: string;
  knownTrucks?: { number: string; driverName: string; driverPhone: string }[];
}) {
  const id = useId();

  function onNumberChange(raw: string) {
    const clean = raw.toUpperCase().replace(/\s+/g, "");
    const match = knownTrucks.find((t) => t.number.toUpperCase().replace(/\s+/g, "") === clean);
    if (match) {
      onChange({
        number: clean,
        driverName: match.driverName || value.driverName,
        driverPhone: match.driverPhone || value.driverPhone,
      });
    } else {
      onChange({ ...value, number: clean });
    }
  }

  return (
    <div className="animate-in-up flex flex-col gap-4">
      {fixedNumber ? (
        <p className="text-sm text-muted-foreground">
          Truck <span className="tabular font-semibold text-foreground">{fixedNumber}</span>
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-number`}>Truck number</Label>
          <Input
            id={`${id}-number`}
            list={`${id}-truck-datalist`}
            value={value.number}
            onChange={(e) => onNumberChange(e.target.value)}
            placeholder="e.g. UP65BT1234"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={14}
          />
          {knownTrucks.length > 0 && (
            <datalist id={`${id}-truck-datalist`}>
              {knownTrucks.map((t) => (
                <option key={t.number} value={t.number}>
                  {t.driverName ? `${t.driverName} (${t.driverPhone || "No phone"})` : t.number}
                </option>
              ))}
            </datalist>
          )}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-driver`}>Driver name</Label>
        <Input
          id={`${id}-driver`}
          value={value.driverName}
          onChange={(e) => onChange({ ...value, driverName: e.target.value })}
          placeholder="Driver Name"
          autoComplete="off"
          maxLength={80}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-phone`}>{phoneOptional ? "Driver phone (optional)" : "Driver phone"}</Label>
        <Input
          id={`${id}-phone`}
          value={value.driverPhone}
          onChange={(e) => onChange({ ...value, driverPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
          placeholder="10-digit mobile"
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          maxLength={14}
        />
      </div>
    </div>
  );
}
