# LaTeX Completion Popup Redesign — Design

**Date:** 2026-07-17
**Status:** Approved (pending written-spec review)

## Problem

The autocomplete popup has three concrete problems the user called out:

1. **Colors feel wrong.** Only the `command` kind has a distinct (primary) color; every other kind — environment, snippet, label, citation, file — shares one muted grey pill, so the popup reads as monochrome and undifferentiated.
2. **The text badge feels out of place.** Each row leads with a fixed-width (`6rem`) text pill ("Command", "Environment", …) that looks bolted-on rather than native to a code editor.
3. **It's too small.** Rows are `0.8125rem` (13px) labels at `2.25rem` (36px) min-height.

## Goal

Replace the per-row text badge with a **VS Code-style per-kind icon**, give each kind its **own semantic color**, and make the rows **noticeably larger** — while keeping the completion data flow, ordering, and side info-panel content unchanged.

Non-goals: no change to what gets completed, to ranking/ordering, to the completion contract, or to the backend. This is presentation only.

## Decisions (from mockup review)

- **Icon treatment: bare glyph (Option A).** A colored SVG glyph with no container — the purest VS Code look, most native to a code editor. (Rejected: tinted-chip "Option B".)
- **Row size: ~44px.** Label `0.875rem` (14px), row `min-height 2.75rem`.
- **Info side-panel: icon only.** The panel's leading text badge is replaced by the same bare glyph, no kind word.
- **Command glyph: LaTeX backslash** — on-brand and distinct from the other five.

## Visual system

### Per-kind icon + color

Icons are inline SVGs authored in the project's existing lucide stroke style (24×24 viewBox, `stroke="currentColor"`, `stroke-width="2"`, round caps/joins), rendered at **18px** in the rows. The color is applied via `color: var(--kind-color)` so `currentColor` tints the stroke.

| Kind | Glyph | lucide reference | Light | Dark |
|---|---|---|---|---|
| command | backslash `\` | custom (lucide-style stroke) | `#7c5cff` | `#a78bfa` |
| environment | braces `{ }` | `Braces` | `#2f76d6` | `#6aa6f5` |
| snippet | `</>` | `Code` | `#b0791f` | `#e0b060` |
| label | tag | `Tag` | `#0e9488` | `#2dd4bf` |
| citation | quotes | `Quote` | `#d6336c` | `#f472a6` |
| file | page | `FileText` | `#4b7bab` | `#8fbce0` |

`file` covers both `\input`-style source files and `\includegraphics` images; a generic page glyph is intentional.

These six hues are **semantic categories** (like VS Code's symbol colors), deliberately distinct from the app's blue `--primary` accent. They are defined as design tokens in `src/index.css` — `--completion-icon-{kind}` under `:root` (light values) and under `.dark` (the dark values above) — exactly like every other theme token in that file, so they flip automatically with the app theme. The CodeMirror theme object references them via `var(--completion-icon-{kind})`; no hardcoded hex lives in `latex-editor.tsx`.

### Sizing

| Property | Current | New |
|---|---|---|
| row label font | `0.8125rem` | `0.875rem` |
| row min-height | `2.25rem` | `2.75rem` |
| row padding | `0.4rem 0.75rem` | `0.5rem 0.85rem` |
| icon size (rows) | — (text badge) | `18px` |

Dropdown list `min-width`/`max-width`/`max-height`, selection styling, matched-text emphasis, and the right-aligned detail column are unchanged.

## Components touched

Presentation only — `src/features/editor/` plus the theme tokens in `src/index.css`.

### `latex-completion.ts`

- **`latexCompletionKindIcon(kind: string): SVGElement | null`** — NEW. Returns a per-kind bare SVG glyph element with class `tex-completion-icon tex-completion-icon-{kind}`, `role="img"`, and `aria-label` / `title` set to `latexCompletionKindLabel(kind)` (so screen readers still announce the kind). Returns `null` for an unrecognized kind.
- **`latexCompletionRowBadge`** — REPLACED. Its `render` now returns `latexCompletionKindIcon(completion.type ?? "")` (an icon node) instead of a text badge. Keeps `position: 10` (leftmost) and the `null`-for-unknown behavior.
- **`renderInfo`** — the leading `.tex-completion-kind` text `<span>` is replaced by `latexCompletionKindIcon(item.kind)` (icon only), appended to `.tex-completion-meta` before the provenance line. Description / preview / hint unchanged.
- **`latexCompletionKindLabel`** — UNCHANGED, but its role narrows to accessibility (icon `aria-label`/`title`) and the icon-map key set; no longer rendered as visible text.

### `src/index.css` (theme tokens)

- Add `--completion-icon-command|environment|snippet|label|citation|file` under `:root` (light values) and `.dark` (dark values), alongside the existing tokens.

### `latex-editor.tsx` (CodeMirror theme)

- Remove the `.tex-completion-kind`, `.tex-completion-kind-command`, and the `[aria-selected] .tex-completion-kind` rules (the text badge is gone).
- Add `.tex-completion-icon` (sizing/flex) and `.tex-completion-icon-{kind}` rules setting `color: var(--completion-icon-{kind})`. The icon keeps its own color even in the selected (`[aria-selected]`) row — the glyph stays legible on the `--accent` ground; if any kind's color is too low-contrast on that ground, that single case may fall back to `currentColor`.
- Bump `.cm-tooltip-autocomplete > ul` font size and the `> li` `min-height`/`padding` per the sizing table.
- `autocompletion({ … addToOptions: [latexCompletionRowBadge], icons: false })` is unchanged — `icons: false` already suppresses CodeMirror's default type-icon, so there is no double-icon.

## Testing

`latex-completion.test.ts`:

- `latexCompletionKindIcon` returns an element whose `aria-label` equals the kind label and whose class encodes the kind, for each of the six kinds; returns `null` for an unknown kind (`"gremlin"`).
- `latexCompletionRowBadge.render` returns an icon node (not a text badge) for a known kind and `null` for an unknown kind — asserting the node is an `<svg>`/has the icon class and the expected `aria-label`, and that no visible text badge string is produced.
- `renderInfo` output contains the icon node in its meta row (query by the icon class) and still contains the provenance and description text.

Existing `latexCompletionKindLabel` / `latexCompletionSourceSummary` / gate / contract tests stay green unchanged.

## Verification

All existing gates must pass: `bun run lint`, `bun run typecheck`, `bun run build`, `bun run test`. Because the popup only renders in the running editor, the change is also confirmed live: open a project, trigger completion, and verify each kind shows its colored icon at the new size in both light and dark themes.

## Out of scope / follow-ups

- No change to completion triggering, ordering, or the IPC contract.
- Icon glyphs and the six hues are the agreed starting point; fine-tuning exact paths/shades during implementation is expected and does not require re-approval.
