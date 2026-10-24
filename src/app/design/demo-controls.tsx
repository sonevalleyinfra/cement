"use client";

import { useState } from "react";
import { FormHint } from "@/components/app/form-hint";
import { Keypad } from "@/components/app/keypad";
import { ReasonPicker } from "@/components/app/reason-picker";
import { SelectField } from "@/components/app/select-field";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { reasonHint } from "@/lib/reason-codes";

export function DemoControls() {
  const [open, setOpen] = useState(false);
  const [bags, setBags] = useState("");
  const [product, setProduct] = useState("t53");
  const [code, setCode] = useState<string | null>(null);
  const [note, setNote] = useState("");

  return (
    <>
      <h2 className="mt-8 mb-3 text-sm font-medium text-muted-foreground">Sheet and keypad</h2>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Enter bags
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Bags">
        <div className="tabular py-4 text-center text-5xl font-bold">{bags || "0"}</div>
        <Keypad value={bags} onChange={setBags} />
        <Button size="lg" className="mt-4 w-full" onClick={() => setOpen(false)}>
          Done
        </Button>
      </Sheet>

      <h2 className="mt-8 mb-3 text-sm font-medium text-muted-foreground">Drop-down</h2>
      <SelectField
        label="Product"
        value={product}
        onChange={setProduct}
        groups={[
          { label: "Trade", options: [{ value: "t53", label: "Prism Trade OPC 53" }, { value: "t43", label: "Prism Trade PPC 43" }] },
          { label: "Non-trade", options: [{ value: "n53", label: "Prism Non-trade PPC 53" }] },
        ]}
      />

      <h2 className="mt-8 mb-3 text-sm font-medium text-muted-foreground">Reason picker</h2>
      <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/6">
        <p className="text-base font-semibold">Reject order?</p>
        <ReasonPicker
          action="reject"
          label="Reject order?"
          code={code}
          onCodeChange={setCode}
          note={note}
          onNoteChange={setNote}
          showHint={false}
        />
        <FormHint>{reasonHint("reject", code, note)}</FormHint>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setCode(null);
              setNote("");
            }}
          >
            Back
          </Button>
          <Button variant="destructive" disabled={reasonHint("reject", code, note) !== null}>
            Reject
          </Button>
        </div>
      </div>
    </>
  );
}
