"use client";

import { useId, useState } from "react";
import { SelectField } from "@/components/app/select-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TruckInput = { number: string; driverName: string; driverPhone: string };

const OTHER = "__other__";

/**
 * The quick truck form: number, driver, phone (purchase and move bags). The phone is required
 * unless `phoneOptional` (moving bags). With `fixedNumber` (a purchase into a truck already in the
 * list) the number is shown as text instead of typed.
 * With `knownTrucks` the number is picked from a list (driver and phone filled in), or "Other truck" to type it.
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

  const [typing, setTyping] = useState(false);
  const isKnownTruck = knownTrucks.some((t) => t.number === value.number);

  function onPick(sel: string) {
    if (sel === OTHER) {
      setTyping(true);
      onChange({ ...value, number: "" });
      return;
    }
    const match = knownTrucks.find((t) => t.number === sel);
    if (!match) return;
    setTyping(false);
    onChange({
      number: match.number,
      driverName: match.driverName || value.driverName,
      driverPhone: match.driverPhone || value.driverPhone,
    });
  }

  return (
    <div className="animate-in-up flex flex-col gap-4">
      {fixedNumber ? (
        <p className="text-sm text-muted-foreground">
          Truck <span className="tabular font-semibold text-foreground">{fixedNumber}</span>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {knownTrucks.length > 0 && (
            <SelectField
              label="Truck"
              value={isKnownTruck ? value.number : typing || value.number ? OTHER : ""}
              onChange={onPick}
              placeholder="Pick a truck"
              options={[
                ...knownTrucks.map((t) => ({ value: t.number, label: [t.number, t.driverName].filter(Boolean).join(" · ") })),
                { value: OTHER, label: "Other truck" },
              ]}
            />
          )}
          {(knownTrucks.length === 0 || (!isKnownTruck && (typing || value.number))) && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-number`}>Truck number</Label>
              <Input
                id={`${id}-number`}
                value={value.number}
                onChange={(e) => onNumberChange(e.target.value)}
                placeholder="BR01AB1234"
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
          autoComplete="off"
          maxLength={80}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-phone`}>{phoneOptional ? "Driver phone (optional)" : "Driver phone"}</Label>
        <Input
          id={`${id}-phone`}
          value={value.driverPhone}
          onChange={(e) => onChange({ ...value, driverPhone: e.target.value })}
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          maxLength={14}
        />
      </div>
    </div>
  );
}
