"use client";

import { useState } from "react";
import { errorKey, type StoredError, visibleError } from "@/lib/form-rules";

/**
 * The one way a form shows an error. The error disappears by itself as soon as any value in `watch`
 * changes (the person fixed the field), and `clearError()` removes it after a successful save or when
 * a sheet opens again. `watch` lists the form's values, e.g. `[bags, productId]`.
 * For a form read with FormData (no state), pass nothing and call `clearError` from the form's `onInput`.
 * `setError(message, valuesAfter)`: when the same click also changes the watched values (picking a
 * retailer), pass the values the form will have, so the error is tied to those.
 */
export function useFormError(watch: unknown = null) {
  const key = errorKey(watch);
  const [stored, setStored] = useState<StoredError | null>(null);
  return {
    error: visibleError(stored, key),
    /** Show `message` for the values the form has right now. An empty message clears it. */
    setError: (message: string, valuesAfter?: unknown) =>
      setStored(message ? { message, key: valuesAfter === undefined ? key : errorKey(valuesAfter) } : null),
    clearError: () => setStored(null),
  };
}
