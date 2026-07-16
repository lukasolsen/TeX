import { describe, expect, it } from "vitest"

import { isLatexWorkspaceFile } from "./vite.config"

describe("LaTeX development-file watching", () => {
  it.each([
    "main.tex",
    "main.log",
    "main.toc",
    "main.aux",
    "main.pdf",
    "main.synctex.gz",
    "main.synctex.gz(busy)",
    "main.run.xml",
  ])("ignores %s so compiler output cannot reload the workspace", (path) => {
    expect(isLatexWorkspaceFile(`/project/${path}`)).toBe(true)
  })

  it("continues watching application source", () => {
    expect(isLatexWorkspaceFile("/project/src/app.tsx")).toBe(false)
  })
})
