export type LatexDocumentation = {
  readonly title: string
  readonly markdown: string
}

export const entry = (title: string, markdown: string): LatexDocumentation =>
  Object.freeze({ title, markdown })
