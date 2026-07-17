# Markdown Editor Hover Documentation Design

## Goal

Replace the editor hover system's fixed summary/example/caution cards with a
feature-local, Markdown-authored documentation catalog. The system must give
LaTeX authors useful, detailed guidance for recognised commands, document
classes, and packages while retaining the existing project-file previews.

## Scope

- Preserve the current hover detection order: project file reference, then
  document class/package name, then LaTeX command.
- Move all recognised-command content out of
  `src/features/editor/latex-hover.ts`.
- Provide detailed bundled documentation for every command currently supported
  by the hover feature and for a curated set of common classes and packages.
- Render the documentation from safe, intentionally limited Markdown.
- Keep project-file preview and failure messages available through the same
  display surface.
- Do not add a network dependency, a documentation download, or a new Tauri
  capability. Reference links may open their authoritative HTTPS destination
  using the application's existing external-link behaviour.

## Non-goals

- Discovering or downloading documentation for arbitrary installed classes or
  packages.
- Implementing a complete CommonMark parser or accepting raw HTML in hover
  content.
- Providing a complete replacement for package manuals.
- Changing source parsing, file-reference resolution, or editor navigation.

## Catalog ownership and location

Create `src/features/editor/latex-documentation.ts`. It is presentation-facing
curated content for the editor, rather than a domain rule, so it belongs next
to the feature that presents it. `src/domain/latex.ts` remains responsible for
parsing commands and resolving source-file references; it must not own prose
or external documentation URLs.

The catalog module exports one immutable data structure and narrow lookup
helpers. Its public model is deliberately flexible:

```ts
export type LatexDocumentation = {
  readonly title: string
  readonly markdown: string
}
```

Documentation entries have no semantic fields such as `example`, `caution`,
or `reference`. The Markdown author chooses the right shape for the topic:
paragraphs, headings, bullet lists, numbered procedures, fenced LaTeX code,
and links. The catalog is divided in the source file into commands, document
classes, and packages with clear section comments and alphabetised entries so
a maintainer can find and edit an item directly.

The module provides the exact lookup operations the hover feature requires:

- command name → documentation entry;
- document-class name → documentation entry;
- package name → documentation entry.

It returns `undefined` for unknown names. The hover feature then uses its
truthful generic explanation instead of implying that TeX has inspected the
user's installed distribution.

## Initial documentation coverage

The initial catalog includes the current command set:

`documentclass`, `usepackage`, `begin`, `end`, `chapter`, `section`,
`subsection`, `title`, `author`, `date`, `maketitle`, `label`, `ref`, `cite`,
`item`, `input`, `include`, `subfile`, `bibliography`, `addbibresource`, and
`includegraphics`.

Each command entry explains its purpose, legal context (for example preamble,
document body, or a required environment), argument meaning, a realistic
minimal example when one clarifies usage, and the most relevant pitfall or
alternative. It links to an authoritative reference where that provides useful
next depth.

The first class catalog covers `article`, `report`, `book`, `memoir`, and
`beamer`. The package catalog covers `amsmath`, `amssymb`, `babel`, `biblatex`,
`booktabs`, `cleveref`, `csquotes`, `fontspec`, `geometry`, `graphicx`,
`hyperref`, `inputenc`, `microtype`, `natbib`, `siunitx`, `subcaption`,
`subfiles`, and `xcolor`.

Every class/package entry states its intended use, the capabilities that make
it appropriate, important configuration or compatibility notes, a minimal
setup example, and an authoritative HTTPS documentation link. The content
will use CTAN package pages and official LaTeX references where appropriate.
It will not promise support for every option, engine, or third-party package.

## Safe Markdown rendering

`latex-hover.ts` will no longer contain a keyword-content record or fixed card
field renderer. It will retrieve an entry from `latex-documentation.ts` and
pass its title and Markdown to an internal DOM-building renderer.

The supported Markdown subset is intentionally small:

- ATX headings;
- paragraphs;
- unordered and ordered lists;
- strong and emphasis text;
- inline code;
- fenced code blocks;
- HTTPS links.

The renderer creates DOM elements and text nodes directly. It never assigns
catalog text with `innerHTML`. Links accept only `https:` URLs and receive
safe external-link attributes. Unsupported syntax stays readable as text.
This is sufficient for the curated catalog while avoiding a parser dependency
and preventing documentation content from becoming executable markup.

For project-file previews and errors, `latex-hover.ts` will construct concise
Markdown strings and render them through this same path. Preview excerpts
remain fenced code and are not interpreted as Markdown content.

## Hover lookup and fallbacks

The existing source scan remains caller-owned: `latexCommands(source)` runs
once per hover query and is shared by file-reference, class/package, and
command resolution.

1. A project file reference wins. Textual `.tex` and `.bib` references retain
   their preview; non-text assets receive a clear non-preview explanation.
2. A name inside `\\documentclass{...}` or `\\usepackage{...}` receives its
   matching catalog documentation when known.
3. An unknown class or package receives a generic, accurate description that
   it is resolved by the configured TeX distribution.
4. A recognised command receives its catalog documentation; unrecognised
   commands produce no editor tooltip.

This keeps existing navigation and reference-preview behaviour intact and
makes the catalog an enhancement, not a source parser change.

## Responsive, accessible presentation

The CodeMirror tooltip stays a compact documentation popover so source editing
remains primary. Its layout is designed for large monitors and constrained
editor panes:

- constrain the tooltip to the smaller of a comfortable reading width and the
  available viewport width, with viewport gutters;
- cap content height to the available viewport and give only the content area
  vertical scrolling;
- make code blocks independently scrollable in both axes so long source lines
  cannot widen the card;
- use semantic `article`, heading, paragraph, list, `code`, `pre`, and anchor
  elements; do not manufacture visual labels such as “Example” or “Caution”;
- retain a restrained popover surface, clear type hierarchy, high-contrast
  readable body text, and visible keyboard focus for links;
- distinguish links with text treatment as well as colour and preserve
  readable link destinations through their label.

The tooltip has no invented actions. External links are genuine links, and the
file-preview instruction continues to describe the actual Ctrl/Command-click
editor behaviour.

## Errors and state handling

The hover query remains asynchronous only for project-file reads. A failed
read returns a tooltip containing the existing safe project error message and
does not alter the editor document, cursor, selection, scroll position, or
last known-good PDF. Catalog lookup and Markdown rendering are synchronous and
have no pending state or external effects.

Unknown class/package names are an expected ready-state fallback, not an
error. Malformed/unsupported Markdown is rendered conservatively as text;
catalog content is bundled application data, but the renderer does not assume
it is safe HTML.

## Tests and verification

Add focused Vitest coverage for:

- command, class, and package catalog lookup;
- recognised hover locations, including every character of a command and a
  class/package name inside comma-separated groups;
- generic fallback for an unknown class or package;
- Markdown DOM output for headings, lists, emphasis, code blocks, and safe
  HTTPS links;
- rejection or text fallback for unsafe link schemes and HTML-like content;
- preserved file-reference resolution and comment exclusion.

Use DOM-level tests for rendered output rather than snapshots that encode CSS
implementation details. Run the relevant hover test file during development,
then the full TypeScript lint, typecheck, build, and Rust verification required
by `AGENTS.md` before handoff.

## Review checklist

- The catalog is easy to locate at `src/features/editor/latex-documentation.ts`
  and no content record remains in `latex-hover.ts`.
- Every initial entry is detailed enough to answer purpose, context, and a
  practical next question without imitating a full manual.
- Documentation structure is authored in Markdown rather than inferred from
  constrained UI fields.
- The renderer is DOM-based, does not accept HTML, and permits only HTTPS
  links.
- Unknown installed dependencies are described truthfully.
- Long cards, narrow panes, code, links, and keyboard focus remain usable.
- Project-file preview and error behaviour remain intact.
