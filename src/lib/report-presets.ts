/**
 * One-tap date ranges for the report filter, as plain functions (no database).
 * Every day is an India calendar day ("YYYY-MM-DD"), taken from `now` through toISTDateKey, so a moment
 * at 18:30 UTC on the 31st is already the 1st in India.
 *
 * Choices where the spec is silent: the week runs Monday to today; "This month" and "This FY" end today
 * (not in the future); the financial year runs 1 April to 31 March.
 */
import { toISTDateKey } from "./datetime";
import { addDays } from "./report-range";

export const PRESETS = ["today", "yesterday", "this_week", "mtd", "last_month", "this_fy", "last_fy"] as const;
export type PresetId = (typeof PRESETS)[number];

export const PRESET_LABELS: Record<PresetId, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  mtd: "This month",
  last_month: "Last month",
  this_fy: "This FY",
  last_fy: "Last FY",
};

const pad = (n: number) => String(n).padStart(2, "0");

export function presetRange(id: PresetId, now: Date): { from: string; to: string } {
  const today = toISTDateKey(now);
  const [y, m] = today.split("-").map(Number);
  switch (id) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const d = addDays(today, -1);
      return { from: d, to: d };
    }
    case "this_week": {
      const sinceMonday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
      return { from: addDays(today, -sinceMonday), to: today };
    }
    case "mtd":
      return { from: `${y}-${pad(m)}-01`, to: today };
    case "last_month": {
      const first = `${y}-${pad(m)}-01`;
      const last = addDays(first, -1);
      return { from: `${last.slice(0, 8)}01`, to: last };
    }
    case "this_fy":
      return { from: `${m >= 4 ? y : y - 1}-04-01`, to: today };
    case "last_fy": {
      const start = m >= 4 ? y - 1 : y - 2;
      return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
    }
  }
}

/** The preset a range equals exactly, or null. */
export function matchPreset(range: { from: string; to: string }, now: Date): PresetId | null {
  return PRESETS.find((id) => {
    const r = presetRange(id, now);
    return r.from === range.from && r.to === range.to;
  }) ?? null;
}
