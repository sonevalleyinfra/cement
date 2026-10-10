"use client";

import { Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { Sheet } from "@/components/app/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addBrand,
  addCementType,
  addGrade,
  type CatalogueList,
  type CatalogueResult,
  renameListItem,
  setListItemActive,
} from "../catalogue/actions";

/** One brand, type or grade. `code` is set for types only. */
export type EditorItem = { id: string; name: string; code?: string };

const rowClass = "flex min-h-14 items-center gap-1 rounded-2xl bg-card py-1 pr-1 pl-4 shadow-card ring-1 ring-foreground/6";

/**
 * Bottom sheet to add, rename or remove brands, types or grades (admin only; the actions check it too).
 * Remove switches the item off: it leaves the drop-downs, but past stock and orders keep it.
 * For grades pass `typeId`: new grades go under that type.
 */
export function ListEditorSheet({
  kind,
  title,
  items,
  typeId,
  open,
  onOpenChange,
  onAdded,
}: {
  kind: CatalogueList;
  title: string;
  items: EditorItem[];
  typeId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new item's id, so the form can pick it. */
  onAdded: (id: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<{ id: string; name: string; code: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isType = kind === "cement_type";

  function run(action: () => Promise<CatalogueResult>, after: (res: Extract<CatalogueResult, { ok: true }>) => void) {
    setError(null);
    start(async () => {
      const res = await action();
      if (!res.ok) return setError(res.error);
      after(res);
      router.refresh();
    });
  }

  function add(e: FormEvent) {
    e.preventDefault();
    run(
      () =>
        kind === "brand"
          ? addBrand(newName)
          : isType
            ? addCementType({ code: newCode, name: newName })
            : addGrade({ typeId: typeId ?? "", name: newName }),
      (res) => {
        setNewName("");
        setNewCode("");
        if (res.id) onAdded(res.id);
      },
    );
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    run(
      () => renameListItem(kind, editing.id, { name: editing.name, code: editing.code }),
      () => setEditing(null),
    );
  }

  function remove(id: string) {
    run(
      () => setListItemActive(kind, id, false),
      () => setRemoving(null),
    );
  }

  function change(next: boolean) {
    if (!next) {
      setEditing(null);
      setRemoving(null);
      setError(null);
    }
    onOpenChange(next);
  }

  return (
    <Sheet open={open} onOpenChange={change} title={title}>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const label = isType ? item.code ?? "" : item.name;
          if (editing?.id === item.id) {
            return (
              <li key={item.id}>
                <form onSubmit={save} className="flex flex-col gap-2 rounded-2xl bg-card p-3 shadow-card ring-1 ring-foreground/6">
                  {isType && (
                    <Input
                      value={editing.code}
                      onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                      aria-label="Code"
                      placeholder="Code"
                      maxLength={10}
                      autoFocus
                    />
                  )}
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    aria-label={isType ? "Full name" : "Name"}
                    placeholder={isType ? "Full name" : "Name"}
                    maxLength={isType ? 60 : 40}
                    autoFocus={!isType}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={pending}>
                      Save
                    </Button>
                  </div>
                </form>
              </li>
            );
          }
          if (removing === item.id) {
            return (
              <li key={item.id} className={rowClass}>
                <span className="flex-1 font-semibold">Remove {label}?</span>
                <Button variant="ghost" onClick={() => setRemoving(null)}>
                  Keep
                </Button>
                <Button variant="destructive" disabled={pending} onClick={() => remove(item.id)}>
                  Remove
                </Button>
              </li>
            );
          }
          return (
            <li key={item.id} className={rowClass}>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{label}</span>
                {isType && item.name && <span className="truncate text-xs text-muted-foreground">{item.name}</span>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Rename ${label}`}
                onClick={() => {
                  setRemoving(null);
                  setEditing({ id: item.id, name: item.name, code: item.code ?? "" });
                }}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${label}`}
                onClick={() => {
                  setEditing(null);
                  setRemoving(item.id);
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          );
        })}
      </ul>

      <form onSubmit={add} className="mt-4 flex flex-col gap-2">
        {isType && (
          <Input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="Code, e.g. PSC"
            aria-label="Code"
            maxLength={10}
          />
        )}
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={kind === "brand" ? "New brand" : isType ? "Full name" : "New grade"}
            aria-label={kind === "brand" ? "New brand" : isType ? "Full name" : "New grade"}
            maxLength={isType ? 60 : kind === "grade" ? 20 : 40}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={pending || (isType ? !newCode.trim() : !newName.trim())}
          >
            Add
          </Button>
        </div>
      </form>

      {error && (
        <p role="status" className="mt-3 flex items-center gap-1.5 text-sm text-destructive">
          <X className="size-4" />
          {error}
        </p>
      )}
    </Sheet>
  );
}
