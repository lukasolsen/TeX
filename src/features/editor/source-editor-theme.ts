import { type Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"

import {
  editorFontStack,
  editorLineHeightRatio,
  type EditorPreferences,
} from "@/domain/preferences"

export function sourceEditorTheme(
  fontSize: number,
  editor: EditorPreferences
): Extension {
  return EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "var(--source)",
      color: "var(--source-foreground)",
      fontSize: `${fontSize}px`,
    },
    ".cm-content": {
      caretColor: "var(--source-foreground)",
      fontFamily: editorFontStack(editor.fontFamily),
      lineHeight: `${editorLineHeightRatio[editor.lineHeight]}`,
      padding: "1rem 0 4rem",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--source-foreground)",
      borderLeftWidth: "2px",
    },
    ".cm-line": { padding: "0 1rem" },
    ".cm-gutters": {
      backgroundColor: "var(--source)",
      color: "var(--muted-foreground)",
      borderRight: "1px solid var(--border)",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "color-mix(in oklch, var(--muted) 65%, transparent)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "color-mix(in oklch, var(--primary) 22%, transparent)",
    },
    "&.cm-focused": {
      outline: "2px solid var(--ring)",
      outlineOffset: "-2px",
    },
    ".cm-scroller": { overflow: "auto" },
    ".cm-project-reference": {
      cursor: "pointer",
      backgroundImage: "linear-gradient(var(--primary), var(--primary))",
      backgroundPosition: "left calc(100% - 0.08em)",
      backgroundRepeat: "no-repeat",
      backgroundSize: "0 1.5px",
      animation:
        "tex-reference-underline 160ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
    },
    // Scoped away from the completion info panel, which also renders a hover
    // card: styling it as a floating tooltip made the completion widget read
    // as two separate dialogs.
    ".cm-tooltip:not(.cm-completionInfo):has(.tex-hover-card)": {
      border: "1px solid var(--border)",
      borderRadius: "0.75rem",
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
      maxWidth: "min(34rem, calc(100vw - 2rem))",
      maxHeight: "calc(100vh - 2rem)",
      overflow: "hidden",
    },
    ".tex-hover-card": {
      boxSizing: "border-box",
      maxHeight: "calc(100vh - 2rem)",
      overflowY: "auto",
      padding: "0.75rem 0.875rem",
    },
    ".tex-hover-card h2": {
      margin: "0",
      display: "block",
      fontFamily: "var(--font-sans)",
      fontSize: "0.8125rem",
    },
    ".tex-hover-card h3, .tex-hover-card h4, .tex-hover-card h5, .tex-hover-card h6":
      {
        margin: "0.8rem 0 0",
        fontFamily: "var(--font-sans)",
        fontSize: "0.75rem",
      },
    ".tex-hover-card p": {
      margin: "0.3rem 0 0",
      fontFamily: "var(--font-sans)",
      fontSize: "0.75rem",
      lineHeight: "1.35",
      color: "var(--muted-foreground)",
    },
    ".tex-hover-card ul, .tex-hover-card ol": {
      margin: "0.45rem 0 0",
      paddingLeft: "1.25rem",
      fontFamily: "var(--font-sans)",
      fontSize: "0.75rem",
      lineHeight: "1.35",
      color: "var(--muted-foreground)",
    },
    ".tex-hover-card a": {
      color: "var(--primary)",
      textDecoration: "underline",
      textUnderlineOffset: "0.14em",
    },
    ".tex-hover-card a:focus-visible": {
      outline: "2px solid var(--ring)",
      outlineOffset: "2px",
    },
    ".tex-hover-card pre": {
      maxHeight: "18rem",
      margin: "0.35rem 0 0",
      overflow: "auto",
      border: "1px solid var(--border)",
      borderRadius: "0.5rem",
      backgroundColor: "var(--editor-preview)",
      padding: "0.7rem 0.75rem",
      fontSize: "0.6875rem",
      lineHeight: "1.5",
      color: "var(--editor-preview-foreground)",
    },
    ".tex-hover-card code": {
      fontFamily: "var(--font-mono)",
      fontSize: "0.92em",
    },
    // Density follows the VS Code suggest widget: 22px rows, one line each,
    // no rules between them, and the detail beside the label rather than
    // pushed to the far edge.
    ".cm-tooltip-autocomplete": {
      border: "1px solid var(--border)",
      borderRadius: "calc(var(--radius) * 0.8)",
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
      boxShadow: "var(--elevation-popover)",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete > ul": {
      maxHeight: "16.5rem",
      minWidth: "22rem",
      maxWidth: "30rem",
      fontFamily: "var(--font-sans)",
      fontSize: "0.8125rem",
    },
    ".cm-tooltip-autocomplete > ul > li": {
      display: "flex",
      alignItems: "center",
      gap: "0.375rem",
      minHeight: "1.375rem",
      padding: "0 0.5rem",
      lineHeight: "1.375rem",
      borderBottom: "none",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)",
    },
    ".cm-completionLabel": {
      flex: "none",
      fontFamily: "var(--font-mono)",
      fontWeight: "400",
      color: "var(--foreground)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionLabel": {
      color: "var(--accent-foreground)",
    },
    ".cm-completionMatchedText": {
      textDecoration: "none",
      fontWeight: "600",
      color: "var(--primary)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionMatchedText":
      { color: "inherit" },
    ".cm-completionDetail": {
      flex: "1 1 auto",
      minWidth: "0",
      marginLeft: "0.25rem",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontStyle: "normal",
      color: "var(--muted-foreground)",
      fontSize: "0.6875rem",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail": {
      color: "color-mix(in oklch, var(--accent-foreground) 72%, transparent)",
    },
    ".tex-completion-icon": {
      flex: "none",
      width: "14px",
      height: "14px",
    },
    ".tex-completion-icon-command": { color: "var(--completion-icon-command)" },
    ".tex-completion-icon-environment": {
      color: "var(--completion-icon-environment)",
    },
    ".tex-completion-icon-snippet": { color: "var(--completion-icon-snippet)" },
    ".tex-completion-icon-label": { color: "var(--completion-icon-label)" },
    ".tex-completion-icon-citation": {
      color: "var(--completion-icon-citation)",
    },
    ".tex-completion-icon-file": { color: "var(--completion-icon-file)" },
    ".tex-completion-icon-package": { color: "var(--completion-icon-package)" },
    ".tex-completion-icon-class": { color: "var(--completion-icon-class)" },
    // CodeMirror styles this element as `.cm-tooltip.cm-completionInfo`, so
    // matching that specificity is what makes these rules apply at all.
    ".cm-tooltip.cm-completionInfo": {
      width: "max-content",
      minWidth: "14rem",
      maxWidth: "22rem",
      maxHeight: "16.5rem",
      overflowY: "auto",
      padding: "0",
      whiteSpace: "normal",
      border: "1px solid var(--border)",
      borderRadius: "0",
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
      boxShadow: "none",
    },
    // Docked against the list, the panel shares its edge and rounds only the
    // outer corners, so the pair reads as one widget rather than two.
    ".cm-tooltip.cm-completionInfo.cm-completionInfo-right": {
      borderLeft: "none",
      borderRadius: "0 calc(var(--radius) * 0.8) calc(var(--radius) * 0.8) 0",
    },
    ".cm-tooltip.cm-completionInfo.cm-completionInfo-left": {
      borderRight: "none",
      borderRadius: "calc(var(--radius) * 0.8) 0 0 calc(var(--radius) * 0.8)",
    },
    // The narrow variants float free of the list, so they keep a full outline.
    ".cm-tooltip.cm-completionInfo.cm-completionInfo-right-narrow, .cm-tooltip.cm-completionInfo.cm-completionInfo-left-narrow":
      {
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) * 0.8)",
        boxShadow: "var(--elevation-popover)",
      },
    // The card is already inside the panel's scroll container; a second one
    // would trap the wheel.
    ".cm-completionInfo .tex-hover-card": {
      maxHeight: "none",
      overflowY: "visible",
      padding: "0.5rem 0.625rem",
    },
    ".tex-completion-info": {
      display: "flex",
      flexDirection: "column",
      gap: "0.375rem",
      padding: "0.5rem 0.625rem",
    },
    ".tex-completion-meta": {
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "0.375rem",
    },
    ".tex-completion-provenance": {
      fontFamily: "var(--font-sans)",
      fontSize: "0.6875rem",
      color: "var(--muted-foreground)",
    },
    ".tex-completion-description": {
      margin: "0",
      fontFamily: "var(--font-sans)",
      fontSize: "0.75rem",
      lineHeight: "1.45",
      color: "var(--popover-foreground)",
    },
    ".tex-completion-preview-label": {
      margin: "0.25rem 0 0",
      fontFamily: "var(--font-sans)",
      fontSize: "0.6875rem",
      fontWeight: "600",
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: "var(--muted-foreground)",
    },
    ".tex-completion-preview": {
      margin: "0",
      maxHeight: "9rem",
      overflow: "auto",
      border: "1px solid var(--border)",
      borderRadius: "0.5rem",
      backgroundColor: "var(--editor-preview)",
      padding: "0.6rem 0.7rem",
      fontFamily: "var(--font-mono)",
      fontSize: "0.6875rem",
      lineHeight: "1.55",
      whiteSpace: "pre",
      color: "var(--editor-preview-foreground)",
    },
    // The lint tooltip is a plain `.cm-tooltip`, so without these it keeps
    // CodeMirror's light default surface and turns into a white card on a dark
    // editor. Everything below resolves through the theme variables instead.
    ".cm-tooltip:has(.cm-tooltip-lint)": {
      border: "1px solid var(--border)",
      borderRadius: "calc(var(--radius) * 0.8)",
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
      boxShadow: "var(--elevation-popover)",
      maxWidth: "min(28rem, calc(100vw - 2rem))",
      overflow: "hidden",
    },
    ".cm-diagnostic": {
      padding: "0.375rem 0.625rem",
      marginLeft: "0",
      borderLeft: "3px solid var(--muted-foreground)",
      fontFamily: "var(--font-sans)",
      fontSize: "0.75rem",
      lineHeight: "1.45",
    },
    ".cm-diagnostic + .cm-diagnostic": {
      borderTop: "1px solid color-mix(in oklch, var(--border) 60%, transparent)",
    },
    ".cm-diagnostic-error": { borderLeftColor: "var(--destructive)" },
    ".cm-diagnostic-warning": {
      borderLeftColor: "var(--diagnostic-warning)",
    },
    ".cm-diagnostic-info": { borderLeftColor: "var(--muted-foreground)" },
    ".cm-diagnostic-hint": { borderLeftColor: "var(--primary)" },
    ".cm-diagnosticSource": {
      display: "block",
      marginTop: "0.125rem",
      fontSize: "0.6875rem",
      opacity: "1",
      color: "var(--muted-foreground)",
    },
    ".cm-diagnosticAction": {
      border: "1px solid var(--border)",
      borderRadius: "calc(var(--radius) * 0.5)",
      backgroundColor: "var(--secondary)",
      color: "var(--secondary-foreground)",
      fontFamily: "var(--font-sans)",
      fontSize: "0.6875rem",
    },
    // The default squiggle is a fixed-colour SVG data URI; a wavy underline
    // takes a variable, so it tracks the theme the way the rest of the editor
    // does.
    ".cm-lintRange": {
      backgroundImage: "none",
      paddingBottom: "0",
      textDecorationLine: "underline",
      textDecorationStyle: "wavy",
      textDecorationSkipInk: "none",
      textDecorationThickness: "1px",
      textUnderlineOffset: "0.2em",
    },
    ".cm-lintRange-error": { textDecorationColor: "var(--destructive)" },
    ".cm-lintRange-warning": {
      textDecorationColor: "var(--diagnostic-warning)",
    },
    ".cm-lintRange-info": { textDecorationColor: "var(--muted-foreground)" },
    ".cm-lintRange-hint": { textDecorationColor: "var(--primary)" },
    ".cm-lintRange-active": {
      backgroundColor:
        "color-mix(in oklch, var(--diagnostic-warning) 24%, transparent)",
    },
    ".cm-lintPoint::after": { borderBottomColor: "var(--destructive)" },
    ".cm-lintPoint-warning::after": {
      borderBottomColor: "var(--diagnostic-warning)",
    },
    ".cm-lintPoint-info::after": {
      borderBottomColor: "var(--muted-foreground)",
    },
    ".cm-lintPoint-hint::after": { borderBottomColor: "var(--primary)" },
    ".tex-completion-hint": {
      margin: "0.125rem 0 0",
      paddingTop: "0.375rem",
      borderTop:
        "1px solid color-mix(in oklch, var(--border) 60%, transparent)",
      fontFamily: "var(--font-sans)",
      fontSize: "0.6875rem",
      color: "var(--muted-foreground)",
    },
  })
}

/** The editor attributes that carry a preference, kept together so the tab-switch
 * path and the preference-change path cannot configure them differently. */
export function contentAttributes(
  label: string,
  editor: EditorPreferences
): Extension {
  return EditorView.contentAttributes.of({
    "aria-label": label,
    "aria-multiline": "true",
    spellcheck: editor.spellCheck ? "true" : "false",
  })
}
