import { useId, type ReactElement } from "react"

import { Input } from "@/components/ui/input"
import type { WorkspaceState } from "@/domain/project"
import {
  editorFontPresets,
  editorFontStack,
  editorLineHeightRatio,
  MAX_EDITOR_FONT_FAMILY_LENGTH,
  MAX_INDENT_WIDTH,
  MIN_INDENT_WIDTH,
  isEditorFontFamily,
  type AppPreferences,
  type EditorLineHeight,
  type IndentStyle,
} from "@/domain/preferences"
import {
  SegmentedChoice,
  SettingRow,
  SettingsHeading,
  Stepper,
  Toggle,
  type ChoiceOption,
} from "@/features/settings/settings-controls"
import type { PreferencePatch } from "@/features/settings/use-app-preferences"

export const MIN_EDITOR_FONT_SIZE = 11
export const MAX_EDITOR_FONT_SIZE = 24
const DEFAULT_EDITOR_FONT_SIZE = 14

const lineHeightOptions: ReadonlyArray<ChoiceOption<EditorLineHeight>> = [
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "relaxed", label: "Relaxed" },
]

const indentStyleOptions: ReadonlyArray<ChoiceOption<IndentStyle>> = [
  { value: "spaces", label: "Spaces" },
  { value: "tabs", label: "Tabs" },
]

export function EditorSettings({
  onReset,
  onSetEditorFontSize,
  onUpdate,
  preferences,
  workspace,
}: {
  onReset: () => void
  onSetEditorFontSize: (fontSize: number) => void
  onUpdate: (patch: PreferencePatch) => void
  preferences: AppPreferences
  workspace: WorkspaceState | null
}): ReactElement {
  const fontPresetListId = useId()
  const editor = preferences.editor
  const fontSize = workspace?.editorFontSize ?? DEFAULT_EDITOR_FONT_SIZE
  return (
    <section aria-labelledby="settings-heading-editor">
      <SettingsHeading
        onReset={onReset}
        preferences={preferences}
        section="editor"
      >
        Editor
      </SettingsHeading>

      <SettingRow
        description="Set a custom monospace font for the source editor. An unavailable name falls back to the system monospace font, which the preview shows."
        footer={
          <pre
            aria-label="Editor font preview"
            className="overflow-x-auto rounded-md border bg-source px-3 py-2 text-source-foreground"
            style={{
              fontFamily: editorFontStack(editor.fontFamily),
              fontSize: `${fontSize}px`,
              lineHeight: editorLineHeightRatio[editor.lineHeight],
            }}
          >
            {"\\section{Results}\n\\label{sec:results} % 0O1lI —"}
          </pre>
        }
        title="Editor font"
      >
        <Input
          aria-label="Editor font family"
          className="h-8 w-52 bg-background font-mono text-xs"
          list={fontPresetListId}
          maxLength={MAX_EDITOR_FONT_FAMILY_LENGTH}
          onChange={(event) => {
            if (!isEditorFontFamily(event.target.value)) return
            onUpdate({ editor: { fontFamily: event.target.value } })
          }}
          placeholder="e.g. JetBrains Mono"
          spellCheck={false}
          value={editor.fontFamily}
        />
        {/* Suggestions rather than buttons: the field accepts any installed
            family, and a datalist offers the common ones without a chip row. */}
        <datalist id={fontPresetListId}>
          {editorFontPresets
            .filter((preset) => preset.value !== "")
            .map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
        </datalist>
      </SettingRow>

      <SettingRow
        description={
          workspace === null
            ? "Open a project to adjust its editor size. Font size is remembered per project."
            : "Remembered with this project, so your reading setup returns next time."
        }
        title="Editor font size"
      >
        <Stepper
          disabled={workspace === null}
          format={(value) => (workspace === null ? "—" : `${value} px`)}
          label="editor font size"
          maximum={MAX_EDITOR_FONT_SIZE}
          minimum={MIN_EDITOR_FONT_SIZE}
          onChange={onSetEditorFontSize}
          value={fontSize}
        />
      </SettingRow>

      <SettingRow
        description="Vertical space between source lines."
        title="Line height"
      >
        <SegmentedChoice
          label="Line height"
          onChange={(value) => onUpdate({ editor: { lineHeight: value } })}
          options={lineHeightOptions}
          value={editor.lineHeight}
        />
      </SettingRow>

      <SettingRow
        description="Show the line number gutter beside the source."
        title="Line numbers"
      >
        <Toggle
          checked={editor.showLineNumbers}
          label="Show line numbers"
          onChange={(showLineNumbers) =>
            onUpdate({ editor: { showLineNumbers } })
          }
        />
      </SettingRow>

      <SettingRow
        description="Tint the line containing the cursor."
        title="Highlight the active line"
      >
        <Toggle
          checked={editor.highlightActiveLine}
          label="Highlight the active line"
          onChange={(highlightActiveLine) =>
            onUpdate({ editor: { highlightActiveLine } })
          }
        />
      </SettingRow>

      <SettingRow
        description="Mark other occurrences of the text you have selected."
        title="Highlight matching selections"
      >
        <Toggle
          checked={editor.highlightSelectionMatches}
          label="Highlight matching selections"
          onChange={(highlightSelectionMatches) =>
            onUpdate({ editor: { highlightSelectionMatches } })
          }
        />
      </SettingRow>

      <SettingRow
        description="Wrap long paragraphs at the edge of the editor instead of scrolling sideways. The file on disk is not changed."
        title="Line wrapping"
      >
        <Toggle
          checked={editor.wrapLines}
          label="Wrap long lines"
          onChange={(wrapLines) => onUpdate({ editor: { wrapLines } })}
        />
      </SettingRow>

      <SettingRow
        description="What Tab and automatic indentation insert. Indentation already in a file is never rewritten."
        title="Indentation"
      >
        <div className="flex items-center gap-2">
          <SegmentedChoice
            label="Indent with"
            onChange={(value) => onUpdate({ editor: { indentStyle: value } })}
            options={indentStyleOptions}
            value={editor.indentStyle}
          />
          <Stepper
            format={(value) => `${value}`}
            label={editor.indentStyle === "tabs" ? "tab width" : "indent size"}
            maximum={MAX_INDENT_WIDTH}
            minimum={MIN_INDENT_WIDTH}
            onChange={(indentWidth) => onUpdate({ editor: { indentWidth } })}
            value={editor.indentWidth}
          />
        </div>
      </SettingRow>

      <SettingRow
        description="Typing ( { or [ inserts the matching closing character."
        title="Close brackets"
      >
        <Toggle
          checked={editor.autoCloseBrackets}
          label="Close brackets automatically"
          onChange={(autoCloseBrackets) =>
            onUpdate({ editor: { autoCloseBrackets } })
          }
        />
      </SettingRow>

      <SettingRow
        description="Completing \begin{…} inserts the matching \end{…} below it, as one undoable edit."
        title="Close LaTeX environments"
      >
        <Toggle
          checked={editor.autoCloseEnvironments}
          label="Close LaTeX environments automatically"
          onChange={(autoCloseEnvironments) =>
            onUpdate({ editor: { autoCloseEnvironments } })
          }
        />
      </SettingRow>

      <SettingRow
        description="Uses the system spell checker, which does not understand LaTeX markup and will flag commands as misspellings."
        title="Spell checking"
      >
        <Toggle
          checked={editor.spellCheck}
          label="Check spelling in the source editor"
          onChange={(spellCheck) => onUpdate({ editor: { spellCheck } })}
        />
      </SettingRow>
    </section>
  )
}
