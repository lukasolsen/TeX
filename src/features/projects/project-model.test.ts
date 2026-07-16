import { describe, expect, it } from "vitest"

import type { ProjectSummary } from "@/domain/project"
import {
  formatLastOpened,
  isReadableSource,
  isPdf,
  preferredPdf,
  preferredRoot,
  preferredSourceFile,
  projectTreeNodes,
  texDependencies,
  treeContainsPath,
} from "@/features/projects/project-model"

const project: ProjectSummary = {
  name: "Thesis",
  path: "/projects/thesis",
  tree: {
    name: "thesis",
    kind: "directory",
    children: [
      {
        name: "chapters",
        kind: "directory",
        children: [{ name: "intro.tex", kind: "file", children: [] }],
      },
      { name: "main.tex", kind: "file", children: [] },
      { name: "main.pdf", kind: "file", children: [] },
    ],
  },
  rootCandidates: [{ path: "main.tex", evidence: ["documentClass"] }],
  rootDetectionNote: null,
  persistenceNote: null,
}

describe("project model", () => {
  it("builds stable project-relative tree paths", () => {
    const rootNodes = projectTreeNodes(project.tree)
    expect(rootNodes.map((entry) => entry.path)).toEqual([
      "chapters",
      "main.tex",
      "main.pdf",
    ])
    const chapters = rootNodes[0]
    expect(chapters).toBeDefined()
    if (chapters === undefined) return
    expect(projectTreeNodes(chapters, chapters.path)[0]?.path).toBe(
      "chapters/intro.tex"
    )
  })

  it("restores only roots and source files that still exist", () => {
    expect(preferredRoot(project, "missing.tex")).toBe("main.tex")
    expect(preferredRoot(project, "chapters/intro.tex")).toBe(
      "chapters/intro.tex"
    )
    expect(preferredSourceFile(project, "chapters/intro.tex", "main.tex")).toBe(
      "chapters/intro.tex"
    )
    expect(preferredSourceFile(project, "missing.tex", "main.tex")).toBe(
      "main.tex"
    )
    expect(treeContainsPath(project.tree, "chapters/intro.tex")).toBe(true)
    expect(treeContainsPath(project.tree, "chapters")).toBe(false)
  })

  it("keeps preview support explicit and case-insensitive", () => {
    expect(isReadableSource("sources/MAIN.TEX")).toBe(true)
    expect(isReadableSource("figures/chart.pdf")).toBe(false)
    expect(isPdf("figures/CHART.PDF")).toBe(true)
  })

  it("restores a project PDF or selects the root output", () => {
    expect(preferredPdf(project, null, "main.tex")).toBe("main.pdf")
    expect(preferredPdf(project, "missing.pdf", "main.tex")).toBe("main.pdf")
    expect(preferredPdf(project, "main.pdf", null)).toBe("main.pdf")
  })

  it("finds direct LaTeX dependencies and ignores comments", () => {
    expect(
      texDependencies(
        String.raw`\input{sections/intro}
% \include{ignored}
\addbibresource{references}
\includegraphics[width=\textwidth]{figures/result.pdf}`,
        "chapters/main.tex"
      )
    ).toEqual([
      { command: "input", kind: "source", path: "chapters/sections/intro.tex" },
      {
        command: "addbibresource",
        kind: "bibliography",
        path: "chapters/references.bib",
      },
      {
        command: "includegraphics",
        kind: "asset",
        path: "chapters/figures/result.pdf",
      },
    ])
  })

  it("formats recent timestamps without future negative durations", () => {
    const now = Date.UTC(2026, 6, 15, 12)
    expect(formatLastOpened(now + 10_000, now)).toBe("Opened just now")
    expect(formatLastOpened(now - 15 * 60_000, now)).toBe("Opened 15m ago")
    expect(formatLastOpened(now - 2 * 60 * 60_000, now)).toBe("Opened 2h ago")
  })
})
