"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateName, type UpdateNameState } from "./actions";

export function UpdateNameForm({ currentName }: { currentName: string }) {
  const [state, formAction, pending] = useActionState<UpdateNameState, FormData>(updateName, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Label htmlFor="name">Display name</Label>
      <div className="flex gap-2">
        <Input id="name" name="name" defaultValue={currentName} required maxLength={100} />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <FormMessage kind="error">{state.error}</FormMessage>
      <FormMessage kind="success">{state.success}</FormMessage>
    </form>
  );
}
