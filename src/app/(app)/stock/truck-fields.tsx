"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TruckInput = { number: string; driverName: string; driverPhone: string };

/**
 * The quick truck form: number, driver, phone (purchase and move bags). The phone is required
 * unless `phoneOptional` (moving bags). With `fixedNumber` (a purchase into a truck already in the
 * list) the number is shown as text instead of typed.
 * Dropdown selector for known trucks with auto-fill, plus manual entry option.
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

  const isKnownTruck = knownTrucks.some((t) => t.number === value.number);

  return (
    <div className="animate-in-up flex flex-col gap-4">
      {fixedNumber ? (
        <p className="text-sm text-muted-foreground">
          Truck <span className="tabular font-semibold text-foreground">{fixedNumber}</span>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {knownTrucks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-truck-select`}>Select Truck (from Fleet)</Label>
              <select
                id={`${id}-truck-select`}
                className="h-12 w-full rounded-xl border bg-background px-3 text-sm font-medium shadow-xs"
                value={isKnownTruck ? value.number : value.number ? "__other__" : ""}
                onChange={(e) => {
                  const sel = e.target.value;
                  if (sel === "__other__") {
                    onChange({ ...value, number: "" });
                  } else if (sel) {
                    const match = knownTrucks.find((t) => t.number === sel);
                    if (match) {
                      onChange({
                        number: match.number,
                        driverName: match.driverName || value.driverName,
                        driverPhone: match.driverPhone || value.driverPhone,
                      });
                    }
                  }
                }}
              >
                <option value="">-- Choose Truck ({knownTrucks.length} available) --</option>
                {knownTrucks.map((t) => (
                  <option key={t.number} value={t.number}>
                    🚛 {t.number} {t.driverName ? `· ${t.driverName}` : ""} {t.driverPhone ? `(${t.driverPhone})` : ""}
                  </option>
                ))}
                <option value="__other__">✏️ + Enter New / Other Truck Number</option>
              </select>
            </div>
          )}

          {(!isKnownTruck || knownTrucks.length === 0) && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-number`}>
                {knownTrucks.length > 0 ? "Or Type Truck Number" : "Truck Number"}
              </Label>
              <Input
                id={`${id}-number`}
                value={value.number}
                onChange={(e) => onNumberChange(e.target.value)}
                placeholder="e.g. UP65BT1234"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={14}
              />
            </div>
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
