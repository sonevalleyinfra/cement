"use client";

import { useState } from "react";
import { Keypad } from "@/components/app/keypad";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";

export function DemoControls() {
  const [open, setOpen] = useState(false);
  const [bags, setBags] = useState("");

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
    </>
  );
}
