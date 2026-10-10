# Design rules (locked)

Read with `CLAUDE.md`. Every screen follows these. Change them only when the owner asks.
Demo of every component: run `pnpm dev`, open `/design` (development only).

## Screen
- Phone first. Design at 390px wide. One column, `max-w-md`, centred on bigger screens.
- Bottom nav: 4 tabs at most. Frame is `AppShell`.
- One primary button per screen, in `PinnedAction`. Tap targets are 48px or more (`Button` default is 48px, `lg` 56px).
- Inputs are 48px high with 16px text (stops iOS zoom).

## Look
- Warm light neutrals with one brand colour: burnt orange (`--primary` / `--brand`), fading into amber
  (`--brand-2`) in `bg-brand-gradient`. Light only. Tokens are in `src/app/globals.css`.
- A soft warm glow sits at the top of every screen (body background). Header and bottom nav are frosted glass.
- The app header shows only the firm name (large, firm colour dot, tap to switch firm) and the notification bell. No app name or logo.
- Brand gradient is used only for: the logo mark (sign-in screens), the one `featured` `ListCard` at the top of Home, and primary buttons' glow.
- Each firm has one fixed accent (`firm-a` to `firm-f`, picked automatically when the firm is added), shown as the dot
  and a light wash in `FirmChip`.
- Status colours appear only in `StatusChip` (soft tinted pill + dot).
- Icons: sections and menu rows get an `IconTile` with a fixed `tone` (orders orange, dues rose, stock/dispatch blue,
  cash green, approvals violet, receipts teal). Keep the same tone for the same thing everywhere.
- Font: Manrope. Three sizes of text matter: big number (`Stat`, 24px bold), body (16px), caption (12px muted).
- Numbers: bold, large, `tabular`. Money in paise with `formatINR(p, { hidePaise: true })` in lists.
- Cards: white, 16px radius, hairline ring plus soft `shadow-card`; tappable cards lift slightly on hover (`shadow-card-hover`).
- Selected toggles (product, payment mode, firm in the switcher) use the primary orange.
- Stock forms pick a product with four small drop-downs (Brand, Trade-type, Type, Grade). In purchase, admins get a pencil
  next to Brand, Type and Grade to add, rename or remove items; a new combination becomes a new product on save.

## Words
- Labels, numbers and actions only. Titles are one or two words ("Orders", "New order").
- No helper sentences, no hero copy, no emoji, no exclamation marks. Gradients only where listed under Look.
- Empty state is a few words plus the action. Errors say what to fix in a few words.
- Confirm dialogs only for destructive actions (reject, cancel, handover).

## Motion
- 150-300ms, ease-out. Nothing loops, pulses or blinks, except the loading shimmer.
- Allowed: each screen fades up once (`animate-page`, in `(app)/template.tsx`), list cards fade up (`animate-in-up`,
  staggered by `index`), badges and tiles pop in once (`animate-pop`), sheet slides up (300ms), button press
  `scale-[0.98]`, cards lift on hover, active tab gets an orange pill and its icon grows slightly.
- Loading uses `Skeleton` blocks with a soft light sweep (`animate-shimmer`), not spinners.
- Reduced-motion users get no animation (handled globally).

## Components (`src/components/app/`)
`AppShell`, `BottomNav`, `PinnedAction`, `ListCard` (`icon`, `featured`), `IconTile`, `FirmChip`, `StatusChip`, `Stat`, `Sheet`, `Keypad`, `Skeleton` / `ListSkeleton`, `EmptyState` (`icon`, `tone`).
Build new screens from these. Add a new shared component here (and to `/design`) before using it twice.
