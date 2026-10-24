"use client";

import { useRef, useState, useTransition } from "react";
import { newRequestId } from "@/lib/ids";
import { nextRequestId } from "@/lib/request-rules";
import { useOnline } from "@/lib/use-online";

/**
 * For a form button that saves something. `run` ignores every tap after the first until the save
 * answers (the button is also disabled by `pending`), and passes the form's one-time `requestId`
 * (see lib/request-rules.ts) so the server never saves the same form twice.
 * After every answer (saved, or refused and fully undone on the server) the form gets a fresh id,
 * so fixing the form and saving again is a new save. If no answer came (the network dropped),
 * it keeps the same id, so a retry can never save twice (`nextRequestId`).
 * While the phone is offline `run` does nothing (nothing is queued); `offline` tells the form.
 */
export function useSubmit() {
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const [requestId, setRequestId] = useState(newRequestId);
  const online = useOnline();

  function run<T extends { ok: boolean }>(save: (requestId: string) => Promise<T>, after?: (res: T) => void) {
    if (busy.current || !navigator.onLine) return;
    busy.current = true;
    const id = requestId;
    startTransition(async () => {
      let answered = false;
      try {
        const res = await save(id);
        answered = true;
        after?.(res);
      } finally {
        setRequestId((current) => nextRequestId(current, answered, newRequestId));
        busy.current = false;
      }
    });
  }

  /** A new id, for a form that is opened again for a different record (for example the dispatch sheet). */
  function renew() {
    setRequestId(newRequestId());
  }

  // Offline counts as pending, so every save button is disabled until the network is back.
  return { pending: pending || !online, run, renew, offline: !online };
}
