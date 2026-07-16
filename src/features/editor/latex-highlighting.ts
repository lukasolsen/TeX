import { HighlightStyle } from "@codemirror/language"
import { tags } from "@lezer/highlight"

export const latexHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, class: "cm-latex-comment" },
  { tag: tags.tagName, class: "cm-latex-command" },
  { tag: tags.keyword, class: "cm-latex-delimiter" },
  { tag: tags.atom, class: "cm-latex-argument" },
  { tag: tags.special(tags.variableName), class: "cm-latex-math" },
  { tag: tags.string, class: "cm-latex-string" },
  { tag: [tags.number, tags.bool], class: "cm-latex-number" },
  { tag: tags.bracket, class: "cm-latex-bracket" },
  { tag: tags.invalid, class: "cm-latex-invalid" },
])
