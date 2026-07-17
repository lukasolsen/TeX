# LaTeX Documentation Catalog Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the editor hover documentation catalog into a very large multi-module curated set (~250–400 commands, ~120–200 packages, ~25–40 document classes) with flexible reference-quality Markdown while keeping the public lookup API stable.

**Architecture:** Split catalog data into `src/features/editor/latex-docs/*` modules that export plain records. `latex-documentation.ts` merges and freezes them and keeps the existing `commandDocumentation` / `documentClassDocumentation` / `packageDocumentation` helpers. Hover code (`latex-hover.ts`) does not change behaviour.

**Tech Stack:** TypeScript, Vitest, existing CodeMirror hover feature. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-17-latex-documentation-catalog-expansion-design.md`

## Global Constraints

- Public API of `latex-documentation.ts` stays stable; `latex-hover.ts` needs no behavioural change.
- Content is fully bundled and offline; no network, CTAN scrape, AI, telemetry, or Tauri capability changes.
- Entry Markdown is free-form (no mandatory template); prefer purpose + example + context; add options/pitfalls/links when useful.
- Truthful only: do not invent options, defaults, or package behaviour.
- Keys: commands without leading `\`; class/package names as used in `\documentclass` / `\usepackage`.
- Prefer alphabetical keys within each module.
- Catalog-only changes; no unrelated refactors.
- Run focused tests after each task; full frontend checks before handoff.
- Each package/command/class key appears in exactly one module (merge throws on duplicates).
- Do not add environment names as command keys unless they are also control sequences; environments are documented via `\begin` and package entries.

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/features/editor/latex-docs/entry.ts` | `LatexDocumentation` type + `entry()` helper |
| `src/features/editor/latex-docs/merge.ts` | `mergeRecords` with duplicate-key errors |
| `src/features/editor/latex-docs/document-classes.ts` | Document class catalog |
| `src/features/editor/latex-docs/commands-structure.ts` | Sectioning, multi-file, TOC, title, labels/refs |
| `src/features/editor/latex-docs/commands-text.ts` | Fonts, spacing, boxes, lists, footnotes |
| `src/features/editor/latex-docs/commands-math.ts` | Math-mode and AMS-related commands |
| `src/features/editor/latex-docs/commands-floats.ts` | Figures, tables, captions, graphics, booktabs cmds |
| `src/features/editor/latex-docs/commands-bibliography.ts` | Cite / BibTeX / biblatex / natbib commands |
| `src/features/editor/latex-docs/commands-beamer.ts` | Beamer presentation commands |
| `src/features/editor/latex-docs/packages-core.ts` | Everyday core packages |
| `src/features/editor/latex-docs/packages-math.ts` | Math packages |
| `src/features/editor/latex-docs/packages-bibliography.ts` | Bibliography packages |
| `src/features/editor/latex-docs/packages-layout.ts` | Layout / float / table packages |
| `src/features/editor/latex-docs/packages-languages.ts` | Language and font packages |
| `src/features/editor/latex-docs/packages-science.ts` | Science / code / graphics packages |
| `src/features/editor/latex-docs/packages-presentation.ts` | Presentation packages |
| `src/features/editor/latex-documentation.ts` | Merge modules → frozen catalog + lookup helpers |
| `src/features/editor/latex-hover.test.ts` | Catalog + merge tests (extend) |

**Do not modify** for this plan: `latex-hover.ts` behaviour (public import path `@/features/editor/latex-documentation` stays).

---

## Content authoring rules (all content tasks)

1. Use `entry("\\name", "markdown...")` for commands; `entry("name", ...)` for packages/classes.
2. Prefer template strings; escape carefully so Markdown fences work in the hover renderer.
3. Include at least one fenced `latex` example when usage is non-obvious.
4. Links: `https://ctan.org/pkg/<name>` or `https://latexref.xyz/...` only.
5. Never claim TeX inspected the user's installation.
6. If unsure of an option, omit it rather than invent.
7. Mention starred forms inside the unstarred entry when important; only add a separate key if the parser stores a distinct command name (inspect `src/domain/latex` if unsure).
8. Every entry must be useful prose — no empty stubs solely to hit counts.

---

### Task 1: Scaffold modules, merge helper, migrate existing catalog

**Files:**
- Create: `src/features/editor/latex-docs/entry.ts`
- Create: `src/features/editor/latex-docs/merge.ts`
- Create: `src/features/editor/latex-docs/document-classes.ts`
- Create: `src/features/editor/latex-docs/commands-structure.ts`
- Create: `src/features/editor/latex-docs/commands-text.ts`
- Create: `src/features/editor/latex-docs/commands-math.ts`
- Create: `src/features/editor/latex-docs/commands-floats.ts`
- Create: `src/features/editor/latex-docs/commands-bibliography.ts`
- Create: `src/features/editor/latex-docs/commands-beamer.ts`
- Create: `src/features/editor/latex-docs/packages-core.ts`
- Create: `src/features/editor/latex-docs/packages-math.ts`
- Create: `src/features/editor/latex-docs/packages-bibliography.ts`
- Create: `src/features/editor/latex-docs/packages-layout.ts`
- Create: `src/features/editor/latex-docs/packages-languages.ts`
- Create: `src/features/editor/latex-docs/packages-science.ts`
- Create: `src/features/editor/latex-docs/packages-presentation.ts`
- Modify: `src/features/editor/latex-documentation.ts`
- Test: `src/features/editor/latex-hover.test.ts`

**Interfaces:**
- Produces: `entry(title, markdown)`, `mergeRecords(...parts)`, same public lookups as today
- Consumes: none

- [ ] **Step 1: Write failing merge tests**

Append inside `describe("LaTeX documentation catalog")` in `src/features/editor/latex-hover.test.ts`:

```ts
it("rejects duplicate keys when merging catalog records", async () => {
  const { mergeRecords } = await import("@/features/editor/latex-docs/merge")
  expect(() =>
    mergeRecords(
      { section: { title: "a", markdown: "a" } },
      { section: { title: "b", markdown: "b" } }
    )
  ).toThrow(/duplicate/i)
})

it("merges disjoint catalog records", async () => {
  const { mergeRecords } = await import("@/features/editor/latex-docs/merge")
  expect(
    mergeRecords(
      { section: { title: "\\section", markdown: "s" } },
      { chapter: { title: "\\chapter", markdown: "c" } }
    )
  ).toEqual({
    section: { title: "\\section", markdown: "s" },
    chapter: { title: "\\chapter", markdown: "c" },
  })
})

it("keeps catalog maps frozen after modular merge", () => {
  expect(Object.isFrozen(latexDocumentation.commands)).toBe(true)
  expect(Object.isFrozen(latexDocumentation.packages)).toBe(true)
  expect(Object.isFrozen(latexDocumentation.documentClasses)).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/features/editor/latex-hover.test.ts`

Expected: FAIL — module `@/features/editor/latex-docs/merge` not found.

- [ ] **Step 3: Create `entry.ts` and `merge.ts`**

`src/features/editor/latex-docs/entry.ts`:

```ts
export type LatexDocumentation = {
  readonly title: string
  readonly markdown: string
}

export const entry = (title: string, markdown: string): LatexDocumentation =>
  Object.freeze({ title, markdown })
```

`src/features/editor/latex-docs/merge.ts`:

```ts
import type { LatexDocumentation } from "@/features/editor/latex-docs/entry"

export function mergeRecords(
  ...parts: readonly Readonly<Record<string, LatexDocumentation>>[]
): Record<string, LatexDocumentation> {
  const out: Record<string, LatexDocumentation> = {}
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (Object.hasOwn(out, key)) {
        throw new Error(`duplicate documentation key: ${key}`)
      }
      out[key] = value
    }
  }
  return out
}
```

- [ ] **Step 4: Migrate existing entries into modules (content unchanged)**

Move every current entry from `latex-documentation.ts` into the correct module. Preserve titles and markdown text exactly.

**Commands:**

| Module export | Keys from current catalog |
|---------------|---------------------------|
| `commandsStructure` | `author`, `begin`, `chapter`, `date`, `documentclass`, `end`, `include`, `input`, `label`, `maketitle`, `ref`, `section`, `subfile`, `subsection`, `title`, `usepackage` |
| `commandsFloats` | `captionsetup`, `includegraphics` |
| `commandsBibliography` | `addbibresource`, `bibliography`, `cite` |
| `commandsText` | `item`, `setlength` |
| `commandsMath` | empty object |
| `commandsBeamer` | empty object |

**Packages:**

| Module export | Keys |
|---------------|------|
| `packagesMath` | `amsmath`, `amssymb` |
| `packagesBibliography` | `biblatex`, `cleveref`, `csquotes`, `natbib` |
| `packagesCore` | `geometry`, `graphicx`, `hyperref`, `microtype`, `subfiles`, `xcolor` |
| `packagesLayout` | `booktabs`, `subcaption` |
| `packagesLanguages` | `babel`, `fontspec`, `inputenc` |
| `packagesScience` | `siunitx` |
| `packagesPresentation` | empty object |

**Document classes:** all of `article`, `beamer`, `book`, `memoir`, `report`, `slides`, `minimal`, `ieeetran` → `documentClasses` in `document-classes.ts`.

Module pattern:

```ts
import { entry, type LatexDocumentation } from "@/features/editor/latex-docs/entry"

export const commandsStructure = {
  section: entry("\\section", `...existing markdown...`),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
```

Empty module pattern:

```ts
import type { LatexDocumentation } from "@/features/editor/latex-docs/entry"

export const commandsMath = {} as const satisfies Readonly<
  Record<string, LatexDocumentation>
>
```

- [ ] **Step 5: Rewrite `latex-documentation.ts` as merge + lookup**

```ts
import type { LatexDocumentation } from "@/features/editor/latex-docs/entry"
import { mergeRecords } from "@/features/editor/latex-docs/merge"
import { commandsStructure } from "@/features/editor/latex-docs/commands-structure"
import { commandsText } from "@/features/editor/latex-docs/commands-text"
import { commandsMath } from "@/features/editor/latex-docs/commands-math"
import { commandsFloats } from "@/features/editor/latex-docs/commands-floats"
import { commandsBibliography } from "@/features/editor/latex-docs/commands-bibliography"
import { commandsBeamer } from "@/features/editor/latex-docs/commands-beamer"
import { documentClasses } from "@/features/editor/latex-docs/document-classes"
import { packagesCore } from "@/features/editor/latex-docs/packages-core"
import { packagesMath } from "@/features/editor/latex-docs/packages-math"
import { packagesBibliography } from "@/features/editor/latex-docs/packages-bibliography"
import { packagesLayout } from "@/features/editor/latex-docs/packages-layout"
import { packagesLanguages } from "@/features/editor/latex-docs/packages-languages"
import { packagesScience } from "@/features/editor/latex-docs/packages-science"
import { packagesPresentation } from "@/features/editor/latex-docs/packages-presentation"

export type { LatexDocumentation }

type DocumentationCatalog = Readonly<{
  commands: Readonly<Record<string, LatexDocumentation>>
  documentClasses: Readonly<Record<string, LatexDocumentation>>
  packages: Readonly<Record<string, LatexDocumentation>>
}>

const commands = mergeRecords(
  commandsStructure,
  commandsText,
  commandsMath,
  commandsFloats,
  commandsBibliography,
  commandsBeamer
)

const packages = mergeRecords(
  packagesCore,
  packagesMath,
  packagesBibliography,
  packagesLayout,
  packagesLanguages,
  packagesScience,
  packagesPresentation
)

export const latexDocumentation: DocumentationCatalog = Object.freeze({
  commands: Object.freeze(commands),
  documentClasses: Object.freeze(mergeRecords(documentClasses)),
  packages: Object.freeze(packages),
})

export function commandDocumentation(
  name: string
): LatexDocumentation | undefined {
  return latexDocumentation.commands[name]
}

export function documentClassDocumentation(
  name: string
): LatexDocumentation | undefined {
  return latexDocumentation.documentClasses[name]
}

export function packageDocumentation(
  name: string
): LatexDocumentation | undefined {
  return latexDocumentation.packages[name]
}
```

- [ ] **Step 6: Run focused tests**

Run: `bun run test src/features/editor/latex-hover.test.ts`

Expected: PASS (existing catalog tests + new merge tests).

- [ ] **Step 7: Commit**

```bash
git add src/features/editor/latex-docs src/features/editor/latex-documentation.ts src/features/editor/latex-hover.test.ts
git commit -m "refactor: split LaTeX documentation catalog into modules"
```

---

### Task 2: Expand document classes (≥25)

**Files:**
- Modify: `src/features/editor/latex-docs/document-classes.ts`
- Modify: `src/features/editor/latex-hover.test.ts`

**Interfaces:**
- Produces: ≥25 document class entries

- [ ] **Step 1: Add failing class coverage test**

```ts
it("documents standard and common document classes", () => {
  for (const name of [
    "article",
    "report",
    "book",
    "memoir",
    "beamer",
    "slides",
    "minimal",
    "letter",
    "proc",
    "ieeetran",
    "revtex4-2",
    "scrartcl",
    "scrreprt",
    "scrbook",
    "scrlttr2",
    "standalone",
    "extarticle",
    "extreport",
    "extbook",
    "amsart",
    "amsbook",
    "amsproc",
    "ltxdoc",
    "moderncv",
    "acmart",
  ] as const) {
    expect(documentClassDocumentation(name)).toBeDefined()
  }
  expect(
    Object.keys(latexDocumentation.documentClasses).length
  ).toBeGreaterThanOrEqual(25)
})
```

- [ ] **Step 2: Run test — expect FAIL** on missing keys.

Run: `bun run test src/features/editor/latex-hover.test.ts`

- [ ] **Step 3: Author class entries**

Implement every name in the test list (and more if desired, up to ~40). For each entry include purpose, a `\documentclass` example, notable structural notes, and a CTAN link when applicable. Deepen existing short class entries when useful.

Also add useful extras if accurate: `revtex4-1`, `ltnews`, `tufte-book`, `tufte-handout`, `hitec`, `octavo`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `bun run test src/features/editor/latex-hover.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/latex-docs/document-classes.ts src/features/editor/latex-hover.test.ts
git commit -m "docs: expand LaTeX document class hover catalog"
```

---

### Task 3: Commands — structure + text

**Files:**
- Modify: `src/features/editor/latex-docs/commands-structure.ts`
- Modify: `src/features/editor/latex-docs/commands-text.ts`
- Modify: `src/features/editor/latex-hover.test.ts`

**Interfaces:**
- Produces: full structure + text command sets listed below

- [ ] **Step 1: Add failing sample test**

```ts
it("documents structure and text commands used in everyday files", () => {
  for (const name of [
    "part",
    "subsubsection",
    "tableofcontents",
    "appendix",
    "frontmatter",
    "pageref",
    "newcommand",
    "textbf",
    "emph",
    "footnote",
    "hspace",
    "vspace",
    "mbox",
    "fbox",
    "today",
    "textcolor",
    "definecolor",
  ] as const) {
    expect(commandDocumentation(name)).toBeDefined()
  }
})
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement structure commands**

In `commands-structure.ts`, ensure all of these keys exist (migrate + expand):

`and`, `addcontentsline`, `addtocontents`, `appendix`, `author`, `autoref`, `backmatter`, `begin`, `chapter`, `cleardoublepage`, `clearpage`, `date`, `documentclass`, `end`, `eqref`, `frontmatter`, `href`, `include`, `includeonly`, `input`, `label`, `linebreak`, `listoffigures`, `listoftables`, `mainmatter`, `maketitle`, `nameref`, `newcommand`, `newcounter`, `newenvironment`, `newpage`, `newline`, `newtheorem`, `nolinebreak`, `nolinkurl`, `nopagebreak`, `pageref`, `pagebreak`, `paragraph`, `part`, `phantomsection`, `providecommand`, `ref`, `refstepcounter`, `renewcommand`, `renewenvironment`, `RequirePackage`, `section`, `setcounter`, `stepcounter`, `subparagraph`, `subsection`, `subsubsection`, `subfile`, `tableofcontents`, `thanks`, `title`, `url`, `usepackage`, `value`

- [ ] **Step 4: Implement text commands**

In `commands-text.ts`, ensure all of these keys exist:

`bfseries`, `bigskip`, `centering`, `cdots`, `colorbox`, `copyright`, `dag`, `ddag`, `ddots`, `definecolor`, `emph`, `enspace`, `fbox`, `fcolorbox`, `fontsize`, `footnotesize`, `framebox`, `hfill`, `hspace`, `huge`, `Huge`, `indent`, `item`, `itshape`, `large`, `Large`, `LARGE`, `LaTeX`, `LaTeXe`, `ldots`, `makebox`, `marginpar`, `mbox`, `mdseries`, `medskip`, `noindent`, `normalsize`, `P`, `pagecolor`, `parbox`, `pounds`, `quad`, `qquad`, `raggedleft`, `raggedright`, `raisebox`, `rmfamily`, `rule`, `S`, `scshape`, `scriptsize`, `selectfont`, `setlength`, `settodepth`, `settoheight`, `settowidth`, `sffamily`, `small`, `smallskip`, `stretch`, `TeX`, `textbf`, `textcolor`, `textmd`, `textnormal`, `textrm`, `textsc`, `textsf`, `textsl`, `textsubscript`, `textsuperscript`, `texttt`, `textup`, `tiny`, `today`, `ttfamily`, `underline`, `upshape`, `vdots`, `verb`, `vfill`, `vspace`, `color`, `rowcolors`, `addtolength`

For colour commands, state the `xcolor` / `color` package requirement.

- [ ] **Step 5: Run tests — PASS**

Run: `bun run test src/features/editor/latex-hover.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/features/editor/latex-docs/commands-structure.ts src/features/editor/latex-docs/commands-text.ts src/features/editor/latex-hover.test.ts
git commit -m "docs: expand structure and text LaTeX command catalog"
```

---

### Task 4: Commands — math

**Files:**
- Modify: `src/features/editor/latex-docs/commands-math.ts`
- Modify: `src/features/editor/latex-hover.test.ts`

**Interfaces:**
- Produces: ≥80 math control-sequence entries (not environment names)

- [ ] **Step 1: Add failing sample test**

```ts
it("documents common math commands", () => {
  for (const name of [
    "frac",
    "sqrt",
    "sum",
    "int",
    "lim",
    "infty",
    "partial",
    "leq",
    "geq",
    "neq",
    "rightarrow",
    "hat",
    "vec",
    "mathbb",
    "mathcal",
    "operatorname",
    "binom",
    "left",
    "right",
    "sin",
    "cos",
    "log",
    "displaystyle",
    "DeclareMathOperator",
    "intertext",
    "tag",
    "substack",
    "xrightarrow",
  ] as const) {
    expect(commandDocumentation(name)).toBeDefined()
  }
})
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement math commands**

Add at least these control sequences to `commands-math.ts` (more is better; aim for 80+):

`acute`, `allowdisplaybreaks`, `approx`, `arccos`, `arcsin`, `arctan`, `arg`, `bar`, `big`, `Big`, `bigg`, `Bigg`, `binom`, `bm`, `bmod`, `boldsymbol`, `breve`, `cdot`, `cfrac`, `check`, `cos`, `cot`, `csc`, `dbinom`, `ddot`, `DeclareMathOperator`, `deg`, `det`, `dfrac`, `dim`, `displaystyle`, `div`, `dot`, `equiv`, `exists`, `exp`, `forall`, `frac`, `gcd`, `geq`, `grave`, `hat`, `hom`, `iiint`, `iint`, `in`, `inf`, `infty`, `int`, `intertext`, `ker`, `left`, `Leftarrow`, `leftarrow`, `leftrightarrow`, `leq`, `lim`, `liminf`, `limsup`, `ln`, `log`, `mapsto`, `mathbb`, `mathbf`, `mathcal`, `mathfrak`, `mathit`, `mathring`, `mathrm`, `mathscr`, `mathsf`, `mathtt`, `max`, `min`, `mod`, `mp`, `nabla`, `neq`, `notin`, `nonumber`, `notag`, `numberwithin`, `oint`, `operatorname`, `overset`, `partial`, `pm`, `pmod`, `pod`, `Pr`, `prod`, `qedhere`, `raisetag`, `right`, `Rightarrow`, `rightarrow`, `scriptscriptstyle`, `scriptstyle`, `sec`, `shoveleft`, `shoveright`, `sideset`, `sim`, `simeq`, `sin`, `sqrt`, `stackrel`, `subset`, `subseteq`, `substack`, `sum`, `sup`, `supset`, `supseteq`, `tag`, `tan`, `tbinom`, `text` (amsmath text-in-math), `textstyle`, `tilde`, `times`, `to`, `tfrac`, `underbrace`, `underset`, `vec`, `widehat`, `widetilde`, `xleftarrow`, `xrightarrow`

Document package needs (`amsmath`, `amssymb`, `amsfonts`, `bm`, `mathtools`) in entries.

Do **not** add environment-only names (`align`, `equation`, `matrix`, `cases`, …) as command keys. Mention those environments in the `amsmath` package entry and/or the `begin` command entry.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/latex-docs/commands-math.ts src/features/editor/latex-hover.test.ts
git commit -m "docs: expand math LaTeX command catalog"
```

---

### Task 5: Commands — floats & graphics

**Files:**
- Modify: `src/features/editor/latex-docs/commands-floats.ts`
- Modify: `src/features/editor/latex-hover.test.ts`

- [ ] **Step 1: Add failing sample test**

```ts
it("documents float and graphics commands", () => {
  for (const name of [
    "includegraphics",
    "graphicspath",
    "resizebox",
    "scalebox",
    "rotatebox",
    "caption",
    "captionof",
    "captionsetup",
    "toprule",
    "midrule",
    "bottomrule",
    "cmidrule",
    "multicolumn",
    "multirow",
    "hline",
    "newcolumntype",
    "rowcolor",
    "cellcolor",
    "subcaption",
    "subcaptionbox",
  ] as const) {
    expect(commandDocumentation(name)).toBeDefined()
  }
})
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement ≥40 float/table/graphics commands**

Include at least: `addlinespace`, `arraystretch`, `bottomrule`, `caption`, `captionof`, `captionsetup`, `cellcolor`, `cline`, `cmidrule`, `columncolor`, `ContinuedFloat`, `extracolsep`, `graphicspath`, `hline`, `includegraphics`, `listof`, `midrule`, `multicolumn`, `multirow`, `newcolumntype`, `newfloat`, `reflectbox`, `resizebox`, `restylefloat`, `rotatebox`, `rowcolor`, `scalebox`, `specialrule`, `subcaption`, `subcaptionbox`, `subfloat`, `tabularnewline`, `toprule`, `vline`, plus related float helpers as accurate.

State package requirements (`graphicx`, `booktabs`, `multirow`, `subcaption`, `caption`, `xcolor` with `table`, `float`, …).

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/latex-docs/commands-floats.ts src/features/editor/latex-hover.test.ts
git commit -m "docs: expand float and graphics LaTeX command catalog"
```

---

### Task 6: Commands — bibliography

**Files:**
- Modify: `src/features/editor/latex-docs/commands-bibliography.ts`
- Modify: `src/features/editor/latex-hover.test.ts`

- [ ] **Step 1: Confirm how citation command names are parsed**

```bash
rg -n "star|name" src/domain/latex.ts src/domain/**/*latex*
```

If starred forms are not separate `name` values, document them inside unstarred entries and do not create keys containing `*`.

- [ ] **Step 2: Add failing sample test**

```ts
it("documents bibliography and citation commands", () => {
  for (const name of [
    "cite",
    "citep",
    "citepauthor",
    "citeyear",
    "citet",
    "nocite",
    "bibliography",
    "bibliographystyle",
    "addbibresource",
    "printbibliography",
    "parencite",
    "textcite",
    "autocite",
    "footcite",
    "fullcite",
    "citetitle",
    "supercite",
    "ExecuteBibliographyOptions",
  ] as const) {
    expect(commandDocumentation(name)).toBeDefined()
  }
})
```

- [ ] **Step 3: Run test — expect FAIL**

- [ ] **Step 4: Implement ≥35 bibliography commands**

Cover BibTeX (`bibliography`, `bibliographystyle`, `cite`, `nocite`), natbib (`citep`, `citepauthor`, `citeyear`, `citet`, `citepalt`, `citealp`, `citeyearpar`, `citetext`, `citenum`), and biblatex (`addbibresource`, `printbibliography`, `parencite`, `textcite`, `autocite`, `smartcite`, `footcite`, `fullcite`, `citetitle`, `citeurl`, `supercite`, `printbibheading`, `defbibheading`, `bibbysection`, `ExecuteBibliographyOptions`, …).

Explain that biblatex and natbib/BibTeX workflows are not mixed.

- [ ] **Step 5: Run tests — PASS**

- [ ] **Step 6: Commit**

```bash
git add src/features/editor/latex-docs/commands-bibliography.ts src/features/editor/latex-hover.test.ts
git commit -m "docs: expand bibliography LaTeX command catalog"
```

---

### Task 7: Commands — beamer

**Files:**
- Modify: `src/features/editor/latex-docs/commands-beamer.ts`
- Modify: `src/features/editor/latex-hover.test.ts`

- [ ] **Step 1: Add failing sample test**

```ts
it("documents common beamer commands", () => {
  for (const name of [
    "frametitle",
    "framesubtitle",
    "pause",
    "onslide",
    "only",
    "uncover",
    "visible",
    "invisible",
    "alert",
    "usetheme",
    "usecolortheme",
    "usefonttheme",
    "useinnertheme",
    "useoutertheme",
    "setbeamertemplate",
    "setbeamercolor",
    "setbeamerfont",
    "logo",
    "titlegraphic",
    "institute",
    "subtitle",
    "againframe",
    "note",
    "AtBeginSection",
    "insertframenumber",
    "inserttotalframenumber",
  ] as const) {
    expect(commandDocumentation(name)).toBeDefined()
  }
})
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement ≥30 beamer-specific commands**

Add only keys that do not already exist in other command modules (for example do not re-add `title` / `author`). Safe set includes the test list plus: `alt`, `temporal`, `structure`, `setbeamersize`, `AtBeginSubsection`, `beamerdefaultoverlayspecification`, `insertsection`, `insertsubsection`, `hyperlinkslideprev`, `hyperlinkslidenext` when accurate.

Note that frame content is usually `\begin{frame}` (documented under `begin` / beamer class), while `frametitle` is a command.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/latex-docs/commands-beamer.ts src/features/editor/latex-hover.test.ts
git commit -m "docs: expand beamer LaTeX command catalog"
```

---

### Task 8: Packages — domain expansion (≥120)

**Files:**
- Modify: all `packages-*.ts` modules
- Modify: `src/features/editor/latex-hover.test.ts`

**Interfaces:**
- Produces: ≥120 package entries, each key in exactly one module

- [ ] **Step 1: Add failing package coverage test**

```ts
it("documents a broad set of everyday packages", () => {
  for (const name of [
    "enumitem",
    "mathtools",
    "unicode-math",
    "biblatex-apa",
    "longtable",
    "fancyhdr",
    "tcolorbox",
    "polyglossia",
    "newtxtext",
    "mhchem",
    "pgfplots",
    "minted",
    "algorithm2e",
    "glossaries",
    "varioref",
    "tikz-cd",
    "pdfpages",
    "todonotes",
    "wrapfig",
    "fontawesome5",
  ] as const) {
    expect(packageDocumentation(name)).toBeDefined()
  }
  expect(Object.keys(latexDocumentation.packages).length).toBeGreaterThanOrEqual(
    120
  )
})
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement packages by module**

Place each package in **exactly one** module.

**packages-core.ts:**  
`adjustbox`, `afterpage`, `animate`, `attachfile`, `bookmark`, `calc`, `draftwatermark`, `embedfile`, `epstopdf`, `eso-pic`, `etoolbox`, `expl3`, `fancyvrb`, `geometry`, `graphicx`, `grffile`, `hypcap`, `hyperref`, `ifthen`, `import`, `kvoptions`, `l3keys2e`, `lipsum`, `blindtext`, `lscape`, `microtype`, `mwe`, `pdfpages`, `pdflscape`, `rotating`, `setspace`, `standalone`, `subfiles`, `svg`, `transparent`, `trimclip`, `url`, `xcolor`, `xparse`, `xstring`, `xurl`, `enumitem`, `collectbox`, `media9`

**packages-math.ts:**  
`aligned-overset`, `amsfonts`, `amsmath`, `amssymb`, `amsthm`, `bbold`, `bm`, `breqn`, `cancel`, `diffcoeff`, `doublestroke`, `dsfont`, `empheq`, `esint`, `extarrows`, `gensymb`, `mathabx`, `mathrsfs`, `mathtools`, `nicematrix`, `physics`, `rsfso`, `stmaryrd`, `tensor`, `textcomp`, `unicode-math`, `wasysym`

**packages-bibliography.ts:**  
`apacite`, `backref`, `bibentry`, `biblatex`, `biblatex-apa`, `biblatex-chicago`, `biblatex-ieee`, `chapterbib`, `csquotes`, `cleveref`, `doi`, `harvard`, `inlinebib`, `jurabib`, `multibib`, `natbib`, `splitbib`

**packages-layout.ts:**  
`appendix`, `array`, `bigfoot`, `booktabs`, `caption`, `changepage`, `chngcntr`, `colortbl`, `diagbox`, `endnotes`, `fancyhdr`, `flafter`, `float`, `floatrow`, `footmisc`, `footnotebackref`, `framed`, `gettitlestring`, `hanging`, `hhline`, `indentfirst`, `lastpage`, `lettrine`, `longtable`, `makecell`, `manyfoot`, `marginnote`, `mdframed`, `multicol`, `multirow`, `needspace`, `pageslts`, `parskip`, `perpage`, `placeins`, `ragged2e`, `refcount`, `scrlayer-scrpage`, `sidecap`, `soul`, `subcaption`, `subfig`, `tabularx`, `tabulary`, `tcolorbox`, `titlesec`, `titletoc`, `tocbibind`, `tocloft`, `todonotes`, `totalcount`, `typearea`, `ulem`, `wrapfig`, `quoting`, `fancybox`

**packages-languages.ts:**  
`babel`, `beramono`, `berasans`, `cabin`, `cfr-lm`, `cmap`, `cm-super`, `courier`, `dejavu`, `ebgaramond`, `fontawesome5`, `fontenc`, `fontspec`, `fourier`, `helvet`, `inconsolata`, `inputenc`, `kpfonts`, `libertine`, `libertinus-type1`, `lmodern`, `mathptmx`, `newpxmath`, `newpxtext`, `newtxmath`, `newtxtext`, `noto`, `polyglossia`, `roboto`, `selnolig`, `sourcecodepro`, `sourcesanspro`, `times`, `academicons`

**packages-science.ts:**  
`acro`, `acronym`, `algorithm`, `algorithm2e`, `algorithmicx`, `algpseudocode`, `bytefield`, `catchfile`, `chemfig`, `chemformula`, `circuitikz`, `csvsimple`, `datatool`, `elements`, `filecontents`, `forest`, `fvextra`, `gb4e`, `glossaries`, `glossaries-extra`, `imakeidx`, `linguex`, `listings`, `listingsutf8`, `makeidx`, `mhchem`, `minted`, `nameref`, `nomencl`, `pgfplots`, `pgfplotstable`, `pythontex`, `siunitx`, `tikz`, `tikz-cd`, `tipa`, `varioref`, `xr`, `xr-hyper`, `smartdiagram`, `pgf-pie`

**packages-presentation.ts:**  
`beamerarticle`, `beamerposter`, `appendixnumberbeamer`, `multimedia`, `pdfcomment`

(Beamer itself is a document class; do not duplicate it as a package unless you intentionally document the `beamer` package alias — prefer class entry only.)

Each package entry: purpose, minimal load example, key options when important, engine/load-order notes when important, CTAN link.

- [ ] **Step 4: Run tests — PASS**

Run: `bun run test src/features/editor/latex-hover.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/latex-docs/packages-*.ts src/features/editor/latex-hover.test.ts
git commit -m "docs: expand LaTeX package hover catalog"
```

---

### Task 9: Command long-tail fill + final size gates

**Files:**
- Modify: any `commands-*.ts` modules as needed
- Modify: `src/features/editor/latex-hover.test.ts`

- [ ] **Step 1: Measure current counts**

```bash
bun -e '
import { latexDocumentation } from "./src/features/editor/latex-documentation.ts"
console.log({
  commands: Object.keys(latexDocumentation.commands).length,
  packages: Object.keys(latexDocumentation.packages).length,
  classes: Object.keys(latexDocumentation.documentClasses).length,
})
'
```

- [ ] **Step 2: Fill until targets met**

Targets: commands ≥ 250, packages ≥ 120, classes ≥ 25.

Suggested long-tail command keys (place in the appropriate module; skip any that already exist):

`AddToHook`, `AtBeginDocument`, `AtEndDocument`, `ce`, `ch`, `cref`, `Cref`, `cpageref`, `DeclareDocumentCommand`, `DeclareRobustCommand`, `draw`, `else`, `enlargethispage`, `ensuremath`, `fancyfoot`, `fancyhead`, `fancypagestyle`, `fill`, `fi`, `gls`, `glspl`, `Gls`, `href`, `IfClassLoadedTF`, `IfPackageLoadedTF`, `includepdf`, `index`, `inputminted`, `lstdefinestyle`, `lstinline`, `lstinputlisting`, `lstset`, `makeatletter`, `makeatother`, `makeglossaries`, `markboth`, `markright`, `mint`, `mintinline`, `NewDocumentCommand`, `newacronym`, `newglossaryentry`, `newlist`, `node`, `num`, `pagenumbering`, `pagestyle`, `PassOptionsToClass`, `PassOptionsToPackage`, `printglossary`, `printindex`, `protect`, `ProvideDocumentCommand`, `pu`, `qty`, `RenewDocumentCommand`, `RemoveFromHook`, `setlist`, `sisetup`, `State`, `textasciicircum`, `textasciitilde`, `textbackslash`, `textbar`, `textbullet`, `textellipsis`, `textemdash`, `textendash`, `texteuro`, `thispagestyle`, `unit`, `usemintedstyle`, `vref`, `While`

Only add real control sequences. Domain commands (`qty`, `ce`, `lstset`, `gls`, `draw`) must note their package.

- [ ] **Step 3: Add final size gate test**

```ts
it("meets catalog coverage targets", () => {
  expect(Object.keys(latexDocumentation.commands).length).toBeGreaterThanOrEqual(
    250
  )
  expect(Object.keys(latexDocumentation.packages).length).toBeGreaterThanOrEqual(
    120
  )
  expect(
    Object.keys(latexDocumentation.documentClasses).length
  ).toBeGreaterThanOrEqual(25)
})
```

- [ ] **Step 4: Run focused suite + typecheck + lint**

```bash
bun run test src/features/editor/latex-hover.test.ts
bun run typecheck
bun run lint
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/latex-docs src/features/editor/latex-documentation.ts src/features/editor/latex-hover.test.ts
git commit -m "docs: meet LaTeX hover catalog coverage targets"
```

---

### Task 10: Deepen high-traffic entries + final verification

**Files:**
- Modify: selected high-traffic entries across modules
- Review: `src/features/editor/latex-docs/**`

- [ ] **Step 1: Deepen high-traffic entries**

Improve reference detail (args/options, pitfalls, links) for:

**Commands:** `documentclass`, `usepackage`, `includegraphics`, `cite`, `ref`, `label`, `begin`, `section`, `newcommand`, `frac`, `caption`, `printbibliography`, `usetheme`, `href`

**Packages:** `geometry`, `hyperref`, `amsmath`, `biblatex`, `siunitx`, `tikz`, `fontspec`, `babel`, `graphicx`, `cleveref`

Leave simple entries free-form; do not force a template on the whole catalog.

- [ ] **Step 2: Diff review**

- No behavioural changes to `latex-hover.ts`
- No secrets, lockfiles, or generated bundles
- No duplicate keys
- No invented package options
- Keys reasonably alphabetical within modules

- [ ] **Step 3: Full frontend verification**

```bash
bun run test src/features/editor/latex-hover.test.ts
bun run lint
bun run typecheck
bun run build
```

Expected: PASS. Skip cargo checks unless Rust files were touched.

- [ ] **Step 4: Final commit if deepen produced changes**

```bash
git add src/features/editor/latex-docs
git commit -m "docs: deepen high-traffic LaTeX hover entries"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Multi-module split under `latex-docs/` | 1 |
| Stable public API | 1 |
| Flexible entry style | 2–10 |
| ~25–40 document classes | 2, 9 |
| ~250–400 commands | 3–7, 9 |
| ~120–200 packages | 8–9 |
| Merge uniqueness tests | 1 |
| Coverage / sample tests | 2–9 |
| Offline bundled content | all |
| Deepen existing where useful | 10 |
| No hover behaviour change | 1, 10 review |

## Notes for agentic workers

- Tasks 2–9 are content-heavy. Prefer one module at a time; keep each task’s tests green before commit.
- If a task exceeds context limits, finish a coherent subset that passes that task’s sample test, then continue in a follow-up commit within the same task.
- Use subagent-driven development: one subagent per task, review between tasks.
- Quality beats padding: never invent options or add empty stubs.
