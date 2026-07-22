import { StateEffect, StateField } from "@codemirror/state"
import { Decoration, EditorView } from "@codemirror/view"

export type ProjectReference = { from: number; to: number } | null

export const setProjectReference = StateEffect.define<ProjectReference>()

export const projectReferenceField = StateField.define({
  create: () => Decoration.none,
  update: (decorations, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(setProjectReference)) {
        const reference = effect.value
        return reference === null
          ? Decoration.none
          : Decoration.set([
              Decoration.mark({ class: "cm-project-reference" }).range(
                reference.from,
                reference.to
              ),
            ])
      }
    }
    // RangeSet.map remaps decoration positions through a ChangeDesc; the
    // argument is change data, not an array callback.
    // oxlint-disable-next-line no-array-callback-reference
    return decorations.map(transaction.changes)
  },
  provide: (field) => EditorView.decorations.from(field),
})
