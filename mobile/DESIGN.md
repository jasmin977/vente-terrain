# Revive Cosmetix — Design system

Field-sales (vente terrain) app: sellers bill shops from their van's stock, often one-handed, outdoors or in a dim van. Admins manage articles, load vans and supervise sales.

**Direction: "atelier ledger".** It is a working tool that carries the brand. The palette is warm paper, near-black ink, and bronze from the RC monogram. Structure comes from hairline ledger rows, not shadowed cards. Numbers are first-class.

Ionic provides routing, transitions, scrolling, refresher, modals/sheets, alerts and gestures. Its default visuals are not used: every screen is built from `src/ui/*`.

## Files

| File | Role |
|---|---|
| `src/theme/variables.css` | Tokens (color light/dark, type, spacing, radius, elevation, motion) + Ionic variable mapping |
| `src/theme/global.css` | Base layer and overrides for the Ionic primitives we keep (tab bar, back button, sheets, alerts) |
| `src/theme/components.css` | One definition per `rc-*` component |
| `src/ui/*` | React components, exported from `src/ui/index.ts` |
| `src/utils/labels.ts` | Display labels/tones for API enums (`COMPTANT` → "Comptant") |
| `src/utils/format.ts` | `formatAmount`, `formatDate`, `formatDateTime`… (screen only; receipts keep `formatMoney`) |

## Rules

1. **Only semantic tokens in components.** No hex values outside `variables.css`.
2. **Bronze is a mark, not a text color.** Use `--rc-accent` for indicators, selection and focus. For bronze text use `--rc-accent-ink`.
3. **Color never carries meaning alone.** Status tags always have text; the payment split bar has a labelled legend and hatching for Crédit.
4. **Amounts go through `<Money>`.** It gives tabular figures, thin-space thousands and a de-emphasised "TND".
5. **One primary action per screen.**
   - Top-level lists use the labelled extended `Fab`.
   - Forms and details use the sticky `ActionBar` in the thumb zone.
   - Destructive actions are an outlined `danger` button at the end of the content and are always confirmed.
6. **Navigation.** The tab bar shows on the 4 root screens only. Pushed screens hide it and use the back button and action bar (see `TabsLayout`).
7. **Pickers are bottom sheets.** Use `PickerSheet` (single choice, searchable past 7 options) or `Sheet`. Exclusive choices of ≤ 4 options use `Segmented` (`variant="tiles"` for larger choices).
8. **States.**
   - Loading: `SkeletonList` for content, `loading` on the button for submits. No blocking overlays.
   - Errors: `PageNotice` with "Réessayer" when retry is meaningful.
   - Empty: `EmptyState`.
   - Disabled submit: explain why via `ActionBar hint`.
9. **Read-only is not disabled.** `Field readOnly` renders a value, not a greyed input.

## Tokens (summary)

- **Color (light / dark):**
  - paper `#F5F2ED` / `#121110`
  - surface `#FFF` / `#1B1917`
  - ink `#1A1816` / `#F3EFE9`
  - ink-2 `#5B554F` / `#B3ABA2`
  - ink-3 `#756E67` / `#958C83`
  - bronze `#9C7A4E` / `#C9A574`
  - positive, warning and danger each have a `-soft` background
  - Every text pair is ≥ 4.5:1. Input borders (`--rc-control`) are ≥ 3:1.
- **Type:**
  - Manrope (bundled, variable) for UI.
  - Instrument Serif (bundled) only for top-level screen titles and the login wordmark.
  - Roles: display 34, amount 32, title 20, headline/body 16, callout 15, meta 13.5, label 12 (uppercase, tracked).
- **Spacing:** 4-pt scale `--rc-space-1…10`. Gutter 16px (20px at ≥ 400px).
- **Radius:** 6 (tags) · 10 (inputs/buttons/thumbs) · 14 (groups) · 22 (sheet top).
- **Size:** touch target 48, controls 52, rows 64.
- **Elevation:** only floating things (FAB, action bar, sheets). Groups use a 1px line.
- **Motion:** press 90ms, base 180ms, `cubic-bezier(.2,.8,.2,1)`. `prefers-reduced-motion` disables it.

## Components

`AppHeader` (large serif / compact with back) · `Button` (primary, secondary, ghost, danger; md/lg; loading) · `IconButton` (required label) · `Field` (label above, hint, error, prefix/suffix, readOnly) · `SearchField` · `Segmented` · `PickerField` / `FilterChip` / `PickerSheet` · `Sheet` · `Section` / `Group` · `Row` · `LineItem` · `Stepper` · `Money` · `Tag` · `SplitBar` · `Notice` / `PageNotice` · `EmptyState` · `SkeletonList` · `Spinner` · `Fab` / `FabSpacer` · `ActionBar` · `AccountButton`.

## Anti-patterns (do not reintroduce)

- Floating-label outline inputs, `IonItem` lists, `IonSelect` popovers and `IonLoading` overlays
- A bare "+" FAB, or a logout icon on every header
- Raw enum values on screen (`ESPECES`, `CREDIT`)
- Gradients, glass, neon, decorative illustrations, a shadow on every card
- Body text under 13px, and tap targets under 44px
