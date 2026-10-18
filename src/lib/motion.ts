/** Stagger delay for list cards that fade up: 30ms per step, 6 steps (0–150ms), later cards share the last step. */
export function stagger(i: number) {
  return { animationDelay: `${Math.min(i, 5) * 30}ms` };
}
