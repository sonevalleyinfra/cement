# Design rules (locked)

Read with `CLAUDE.md`. Every screen follows these. Change them only when the owner asks.
Demo of every component: run `pnpm dev`, open `/design` (development only).

## Screen
- Phone first. Design at 390px wide. One column, `max-w-md`, centred on bigger screens.
- Bottom nav: 4 tabs at most. Frame is `AppShell`.
- One primary button per screen, in `PinnedAction`. Tap targets are 48px or more (`Button` default is 48px, `lg` 56px).
- Inputs are 48px high with 16px text (stops iOS zoom).

## Look
- Warm cement-grey neutrals, light only. Tokens are in `src/app/globals.css`.
- Each firm has one fixed accent (`firm-a` to `firm-f`, picked automatically when the firm is added), shown only as the dot in `FirmChip`.
- Status colours (`status-*`) appear only as the dot in `StatusChip`. Nowhere else.
- Font: Manrope. Three sizes of text matter: big number (`Stat`, 24px bold), body (16px), caption (12px muted).
- Numbers: bold, large, `tabular`. Money in paise with `formatINR(p, { hidePaise: true })` in lists.
- Cards: white, 16px radius, hairline ring, no shadow.

## Words
- Labels, numbers and actions only. Titles are one or two words ("Orders", "New order").
- No helper sentences, no hero copy, no emoji, no exclamation marks, no gradients.
- Empty state is a few words plus the action. Errors say what to fix in a few words.
- Confirm dialogs only for destructive actions (reject, cancel, handover).

## Motion
- 150-200ms, ease-out. Nothing loops, pulses or blinks.
- Allowed: sheet slides up, button press `scale-[0.98]`, list cards fade up (`animate-in-up`, staggered by `index`), tab icon grows slightly.
- Loading uses plain grey `Skeleton` blocks, not spinners.
- Reduced-motion users get no animation (handled globally).

## Components (`src/components/app/`)
`AppShell`, `BottomNav`, `PinnedAction`, `ListCard`, `FirmChip`, `StatusChip`, `Stat`, `Sheet`, `Keypad`, `Skeleton` / `ListSkeleton`, `EmptyState`.
Build new screens from these. Add a new shared component here (and to `/design`) before using it twice.
