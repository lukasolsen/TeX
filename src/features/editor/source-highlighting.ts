/**
 * One highlight style for every language other than LaTeX.
 *
 * The classes resolve to the same `--editor-*` tokens the LaTeX highlighter
 * uses, so a string in a `.bib` file, a `.yaml` file, and a `.tex` file are the
 * same colour. A reader moving between the files of one project should not have
 * to relearn what a colour means.
 */

import { HighlightStyle } from "@codemirror/language"
import { tags as t } from "@lezer/highlight"

export const sourceHighlightStyle = HighlightStyle.define([
  {
    tag: [t.comment, t.lineComment, t.blockComment],
    class: "cm-syntax-comment",
  },
  {
    tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword],
    class: "cm-syntax-keyword",
  },
  { tag: [t.string, t.special(t.string), t.regexp], class: "cm-syntax-string" },
  { tag: [t.number, t.bool, t.atom, t.unit], class: "cm-syntax-number" },
  {
    tag: [t.propertyName, t.attributeName],
    class: "cm-syntax-property",
  },
  {
    tag: [t.typeName, t.className, t.tagName, t.namespace],
    class: "cm-syntax-type",
  },
  {
    tag: [t.definition(t.variableName), t.function(t.variableName)],
    class: "cm-syntax-definition",
  },
  { tag: t.labelName, class: "cm-syntax-label" },
  {
    tag: [t.variableName, t.standard(t.variableName)],
    class: "cm-syntax-name",
  },
  {
    tag: [t.operator, t.punctuation, t.separator, t.bracket],
    class: "cm-syntax-punctuation",
  },
  { tag: t.meta, class: "cm-syntax-meta" },
  { tag: t.escape, class: "cm-syntax-escape" },
  { tag: t.invalid, class: "cm-syntax-invalid" },
  // Mathematics, wherever it appears: Markdown next to a LaTeX document uses
  // the same notation the document does.
  { tag: t.special(t.variableName), class: "cm-syntax-math" },
  { tag: t.processingInstruction, class: "cm-syntax-marker" },
  // The top two levels carry a size step, the way a rendered document does;
  // deeper ones would stop being distinguishable in a monospaced editor.
  { tag: t.heading1, class: "cm-syntax-heading cm-syntax-heading-1" },
  { tag: t.heading2, class: "cm-syntax-heading cm-syntax-heading-2" },
  {
    tag: [t.heading, t.heading3, t.heading4, t.heading5, t.heading6],
    class: "cm-syntax-heading",
  },
  { tag: t.strong, class: "cm-syntax-strong" },
  { tag: t.emphasis, class: "cm-syntax-emphasis" },
  { tag: t.strikethrough, class: "cm-syntax-strikethrough" },
  { tag: t.link, class: "cm-syntax-link" },
  { tag: t.url, class: "cm-syntax-url" },
  { tag: t.monospace, class: "cm-syntax-code" },
  { tag: t.list, class: "cm-syntax-list" },
  { tag: t.quote, class: "cm-syntax-quote" },
  { tag: t.contentSeparator, class: "cm-syntax-separator" },
])
