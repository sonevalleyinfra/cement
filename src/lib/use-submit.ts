"use client";

import { useRef, useState, useTransition } from "react";
import { newRequestId } from "@/lib/ids";

/**
 * For a form button that saves something. `run` ignores every tap after the first until the save
 * answers (the button is also disabled by `pending`), and passes the form's one-time `requestId`
 * (see lib/request-rules.ts) so the server never saves the same form twice.
 * After a successful save the form gets a fresh id for the next entry; after an error it keeps
 * the same one (nothing was saved, so trying again is safe).
 */
export function useSubmit() {
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const [requestId, setRequestId] = useState(newRequestId);

  function run<T extends { ok: boolean }>(save: (requestId: string) => Promise<T>, after?: (res: T) => void) {
    if (busy.current) return;
    busy.current = true;
    const id = requestId;
    startTransition(async () => {
      try {
        const res = await save(id);
        if (res.ok) setRequestId(newRequestId());
        after?.(res);
      } finally {
        busy.current = false;
      }
    });
  }

  /** A new id, for a form that is opened again for a different record (for example the dispatch sheet). */
  function renew() {
    setRequestId(newRequestId());
  }

  return { pending, run, renew };
}
