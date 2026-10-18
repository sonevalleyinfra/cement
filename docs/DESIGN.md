# Design rules (locked)

Read with `CLAUDE.md`. Every screen follows these. Change them only when the owner asks.
Demo of every component: run `pnpm dev`, open `/design` (development only).

## Screen
- Phone first. Design at 390px wide. One column, `max-w-md`, centred on bigger screens.
- Bottom nav: 4 tabs at most. Frame is `AppShell`.
- Every screen starts with `PageHeader`, except Home (the app header is its title). Sub-screens pass `back` (the parent screen's href); there is no other way-back link.
- One primary button per screen, in `PinnedAction`. Tap targets are 48px or more (`Button` default is 48px, `lg` 56px).
- Inputs are 48px high with 16px text (stops iOS zoom).
- **Every tap target is 48px or more**: buttons, drop-downs, chips, text links (`TextLink`), phone links, checkboxes.
  `Button` sizes `xs` / `sm` only make the text smaller. Header bell is 48px.

## Look
- Warm light neutrals with one brand colour: burnt orange (`--primary` / `--brand`), fading into amber
  (`--brand-2`) in `bg-brand-gradient`. Light only. Tokens are in `src/app/globals.css`.
- A soft warm glow sits at the top of every screen (body background). Header and bottom nav are frosted glass.
- The app header shows only the app name ("Cement", large, `AppTitle`) and the notification bell. No logo.
- Brand gradient is used only for: the logo mark (sign-in screens), the one `featured` `ListCard` at the top of Home, and primary buttons' glow.
- Status colours appear only in `StatusChip` (soft tinted pill + dot).
- Icons: sections and menu rows get an `IconTile` with a fixed `tone` (orders orange, dues rose, stock/dispatch blue,
  cash green, approvals violet, receipts teal). Keep the same tone for the same thing everywhere.
- Font: Manrope. Three sizes of text matter: big number (`Stat`, 24px bold), body (16px), caption (12px muted).
- Numbers: bold, large, `tabular`. Money in paise with `formatINR(p, { hidePaise: true })` in lists (drops ".00" on
  whole rupees only; real paise always show). Statements, ledgers, supplier accounts and reports use `formatINR(p)`.
- Cards: white, 16px radius, hairline ring plus soft `shadow-card`; tappable cards lift slightly on hover (`shadow-card-hover`).
- Selected toggles and filter tabs (product, payment mode, order list) use the primary orange (`chipClass`, 48px tall).
- A rate per bag is always typed in `RateField` (a 48px number field with the total under it): new order, filling a
  retailer's order, changing a rate. The keypad stays for bags and payment amounts.
- Product pickers start with **Brand**, then Trade-type, Type, Grade. With only one switched-on brand the Brand drop-down is
  hidden (that brand is used) and lists are not grouped by brand; with more, lists group by brand ("Prism · Trade").
  Stock forms (purchase, opening, adjust) offer only existing products, narrowed step by step; picking a brand starts at
  its first product. New products are added in Catalogue.

## Words
- Labels, numbers and actions only. Titles are one or two words ("Orders", "New order").
- No helper sentences, no hero copy, no emoji, no exclamation marks. Gradients only where listed under Look.
- Empty state is a few words plus the action. Errors say what to fix in a few words.
- Confirm dialogs only for destructive actions (reject, cancel, handover, turning a shop off). Use `ConfirmStep`
  (a short question, Back and the action).
- A button that is switched off because something is missing says what, just above it: `FormHint` with
  `firstMissing([[missing, "Enter the amount"], ...])` (`src/lib/form-rules.ts`). Never leave a dead button silent.
- An error goes away by itself when the person fixes the field, and after a save: `useFormError(valuesWatched)`
  (`src/lib/use-form-error.ts`). For forms read with `FormData`, call its `clearError` from the form's `onInput`.
- Lists with a filter active say so when empty ("Nothing in these dates"), not "Nothing yet" (`emptyListTitle`).
- Names of roles are capitalised ("Sales", "Admin"); say "1 bag", "50 bags" (`bagsText`).
- Save buttons ignore taps after the first until the save answers (`useSubmit` in `src/lib/use-submit.ts`).

## Motion
- 150-300ms, ease-out. Nothing loops, pulses or blinks, except the loading shimmer.
- Allowed: each screen fades up once (`animate-page`, in `(app)/template.tsx`), list cards fade up (`animate-in-up`,
  staggered by `index`), badges and tiles pop in once (`animate-pop`), sheet slides up (300ms), button press
  `scale-[0.98]`, cards lift on hover, active tab gets an orange pill and its icon grows slightly.
- Loading uses `Skeleton` blocks with a soft light sweep (`animate-shimmer`), not spinners.
- Reduced-motion users get no animation (handled globally).

## Components (`src/components/app/`)
`AppShell`, `BottomNav`, `PageHeader` (screen title, 48px row, optional `back` chevron and right `action`), `PinnedAction`, `ListCard` (`icon`, `featured`), `IconTile`, `StatusChip`, `Stat`, `Sheet`, `Keypad`, `Skeleton` / `ListSkeleton`, `EmptyState` (`icon`, `tone`),
`RangeForm` / `FilterSelect` (date range and filters as a plain GET form), `DataTable` (compact numbers table that scrolls
sideways inside its own box, never the page; `stacked` turns each row into a small card for tables with many number
columns), `FilterTabs` (filter pills that are links, the pick lives in the address: `/orders?show=rate`, so Home can link to it),
`TextLink`, `chipClass`, `FormHint`, `ConfirmStep`, `RateField`, `SectionCaption` (12px group caption above a list of cards or rows). `ListCard` takes `href` (link) or `onClick` (opens a sheet).
Retailers and other lists with many fields in each row: the row is a `ListCard` with `onClick`; everything about one row is
edited in one sheet with one Save button.
Report tables on a phone: product names drop the brand while only one brand is on (`shortProductName`), and wide tables
(profit, dues, stock flows) are `stacked`.
Build new screens from these. Add a new shared component here (and to `/design`) before using it twice.
