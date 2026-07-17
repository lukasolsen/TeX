# LaTeX Documentation Catalog Expansion Design

## Goal

Grow the editor hover documentation catalog from a small curated set into a
very large, high-quality reference for common LaTeX work: hundreds of
commands, roughly one to two hundred packages, and the main document classes.
Authors should get useful, truthful detail on hover without network access or
mock coverage.

This expands the catalog introduced by
`2026-07-17-markdown-editor-hover-documentation-design.md`. It does not change
hover detection order, Markdown rendering rules, or project-file previews.

## Scope

- Expand `commands`, `documentClasses`, and `packages` coverage substantially.
- Split catalog data into category modules under `src/features/editor/latex-docs/`.
- Keep the public API of `latex-documentation.ts` stable so
  `latex-hover.ts` needs no behavioural change.
- Improve entry quality with reference-style detail where it helps, without
  forcing a fixed field template on every entry.
- Keep all content bundled and offline; CTAN / latexref links may open via
  existing external-link behaviour.
- Update tests for merge integrity and broader catalog sampling.

## Non-goals

- Runtime discovery or download of installed TeX package manuals.
- AI-generated documentation or live CTAN scraping in the app.
- Changing source parsing, autocomplete, or hover UI chrome.
- Exhaustive coverage of every CTAN package or every TeX primitive.
- Requiring identical section structure in every Markdown entry.

## Decisions

| Decision | Choice |
|----------|--------|
| Breadth | Very large curated set (hand-authored), not near-exhaustive CTAN dump |
| Depth | Reference-quality when useful; freer short prose for simple items |
| Structure | Multi-module split by category; single public lookup API |
| Authoring | Human-written; no generation pipeline in this work |
| Runtime | Fully bundled; no network for docs |

## Architecture

### Public API (unchanged)

```ts
export type LatexDocumentation = {
  readonly title: string
  readonly markdown: string
}

export function commandDocumentation(name: string): LatexDocumentation | undefined
export function documentClassDocumentation(name: string): LatexDocumentation | undefined
export function packageDocumentation(name: string): LatexDocumentation | undefined

export const latexDocumentation: {
  readonly commands: Readonly<Record<string, LatexDocumentation>>
  readonly documentClasses: Readonly<Record<string, LatexDocumentation>>
  readonly packages: Readonly<Record<string, LatexDocumentation>>
}
```

Lookup remains exact name match (no fuzzy search). Unknown names return
`undefined`; hover continues to show its generic class/package fallback.

### Module layout

```
src/features/editor/
  latex-documentation.ts          # merge + freeze + lookup helpers
  latex-docs/
    entry.ts                      # entry() helper + shared types
    document-classes.ts
    commands-structure.ts         # sectioning, include/input, TOC, title
    commands-text.ts              # fonts, spacing, boxes, lists, footnotes
    commands-math.ts              # math mode and common math commands
    commands-floats.ts            # figures, tables, captions, graphics
    commands-bibliography.ts      # cite, bibtex/biblatex/natbib commands
    commands-beamer.ts            # presentation-oriented commands
    packages-core.ts              # graphicx, geometry, hyperref, …
    packages-math.ts
    packages-bibliography.ts
    packages-layout.ts
    packages-languages.ts
    packages-science.ts           # siunitx, chem, plots, listings, …
    packages-presentation.ts
```

Each data module exports a `Record<string, LatexDocumentation>` (or
`as const satisfies …`). `latex-documentation.ts` merges records into the three
catalog maps, freezes them, and exports lookup helpers.

Modules may be added later if a category grows unwieldy; the public API stays
the same.

### Merge rules

- Keys are catalog names without a leading backslash for commands
  (`includegraphics`, not `\\includegraphics`). Titles may still show `\\name`.
- Document class and package keys are the names used in
  `\\documentclass{…}` / `\\usepackage{…}` (for example `ieeetran`, `amsmath`).
- Merge must fail tests if any key collides across modules of the same catalog
  kind.
- Alphabetical ordering inside modules is preferred for maintainability; it is
  not a runtime requirement.

## Entry content guidelines

Entries remain free-form Markdown under a title. There is **no mandatory
template**. Authors choose depth based on complexity.

### Always useful

- A clear purpose statement.
- At least one realistic fenced `latex` example when usage is non-obvious.
- Legal context when it matters (preamble vs body, required package/environment).

### Often useful for complex APIs

- Syntax sketch of arguments and common optional keys.
- Related commands or packages named in prose.
- Engine or load-order notes when wrong usage fails (for example `fontspec` vs
  pdfLaTeX, `hyperref` load order).
- Common pitfalls.
- A link to CTAN or latexref.xyz when an authoritative page exists.

### May stay short

Simple commands (for example `\\today`, basic size switches) may be a few
sentences plus an example. Do not pad entries to match longer ones.

### Truthfulness

- Do not invent options, defaults, or package behaviour.
- Do not claim the app inspected the user's TeX tree.
- Prefer conservative wording when package ecosystems vary by version.

## Coverage targets

First delivery aims for approximately:

| Catalog | Target count | Notes |
|---------|--------------|--------|
| Commands | 250–400 | Core LaTeX + commands from documented packages users hover often |
| Packages | 120–200 | Everyday paper / thesis / slide / science set |
| Document classes | 25–40 | Standard classes + common thesis/journal/presentation classes |

Exact counts are targets, not hard gates. Quality beats filling with thin stubs.

### Command priority waves

1. Structure and multi-file: sectioning, include/input, TOC, labels/refs.
2. Text and layout: fonts, sizes, spacing, boxes, lists, footnotes.
3. Math: common math-mode commands and AMS-related commands.
4. Floats and graphics: figure/table, caption, includegraphics, booktabs.
5. Bibliography: cite variants, BibTeX / biblatex / natbib commands.
6. Beamer: frame, overlay, alert, pause, and related commands.
7. Domain long tail tied to packages we document (units, colour, listings, …).

### Package domains (illustrative)

- Core: graphicx, geometry, hyperref, xcolor, microtype, setspace, enumitem
- Math: amsmath, amssymb, amsthm, mathtools, unicode-math
- Bibliography: biblatex, natbib, csquotes, cleveref
- Layout: booktabs, caption, subcaption, longtable, multirow, array, tabularx,
  float, fancyhdr, titlesec, tocloft, appendix
- Languages / fonts: babel, polyglossia, fontspec, inputenc, fontenc
- Science / code: siunitx, mhchem, chemfig, tikz, pgfplots, listings, minted,
  algorithm2e / algorithmicx
- Multi-file / presentation: subfiles, import, beamer-related packages as needed

### Document classes (illustrative)

article, report, book, memoir, beamer, slides, minimal, letter, proc, IEEEtran,
revtex variants commonly used, KOMA-Script (`scrartcl`, `scrreprt`, `scrbook`),
and frequent thesis/journal classes when documentation can be stated accurately.

## Delivery plan

1. Scaffold `latex-docs/entry.ts` and category modules.
2. Move existing entries from `latex-documentation.ts` into modules without
   changing public exports.
3. Expand modules in priority waves toward the coverage targets.
4. Deepen existing short entries where reference detail helps; leave simple
   ones free-form.
5. Update tests for broader sampling and merge uniqueness.
6. Run lint, typecheck, and editor hover tests.

Implementation may land as one cohesive PR if size is manageable, or as
sequential PRs that only add catalog modules after the split lands first.

## Testing

- Keep existing lookup tests for known names.
- Assert `commandDocumentation` / `packageDocumentation` /
  `documentClassDocumentation` return defined entries for a sample from each
  module.
- Assert no duplicate keys when merging module records (unit test over the
  merge helper or module key sets).
- Keep hover integration tests green; no required change to detection order.
- Do not require a test for every catalog entry’s prose.

## Performance and product constraints

- Content is static strings; at the target scale, bundle growth is acceptable.
- No accounts, telemetry, cloud storage, or AI calls.
- No filesystem or build-process changes; presentation-layer data only.
- Truthful UI: unknown packages/classes keep the generic fallback already
  implemented in hover.

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Oversized single file | Multi-module split |
| Incorrect documentation | Curated prose; link to CTAN/latexref; conservative claims |
| Key collisions after split | Merge uniqueness tests |
| Review noise | Catalog-only PR; avoid unrelated refactors |
| Scope creep to “all of CTAN” | Hard non-goal; targets are curated everyday coverage |

## Success criteria

- Public lookup API unchanged and hover behaviour preserved.
- Catalog reaches the approximate coverage targets with useful Markdown.
- Entry depth is flexible: rich where needed, short where enough.
- Tests cover lookups, samples per module, and merge uniqueness.
- All content remains offline and bundled.

## Relationship to prior design

`2026-07-17-markdown-editor-hover-documentation-design.md` defines hover
rendering, detection order, and the `LatexDocumentation` model. This document
supersedes only its **initial coverage** and **single-file catalog** layout. It
does not reopen Markdown subset, file-preview, or network-policy decisions from
that design.
