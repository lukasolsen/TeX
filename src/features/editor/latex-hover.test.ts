// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest"
import { EditorView } from "@codemirror/view"

import type { SourceDocument } from "@/domain/project"

const { readProjectSource } = vi.hoisted(() => ({
  readProjectSource: vi.fn<() => Promise<SourceDocument>>(),
}))

vi.mock("@/services/project-service", () => ({
  projectErrorFromUnknown: () => ({ message: "Unable to read project file." }),
  readProjectSource,
}))

import {
  commandDocumentation,
  documentClassDocumentation,
  latexDocumentation,
  packageDocumentation,
} from "@/features/editor/latex-documentation"
import { commandsBibliography } from "@/features/editor/latex-docs/commands-bibliography"
import { commandsBeamer } from "@/features/editor/latex-docs/commands-beamer"
import {
  keywordAt,
  latexHoverTooltip,
  referencedFileAt,
  renderMarkdownDocumentation,
} from "@/features/editor/latex-hover"
import {
  canonicalProjectPath,
  projectRelativePath,
  revisionHash,
} from "@/domain/identifiers"

describe("LaTeX documentation catalog", () => {
  it("meets catalog coverage targets", () => {
    expect(
      Object.keys(latexDocumentation.commands).length
    ).toBeGreaterThanOrEqual(250)
    expect(
      Object.keys(latexDocumentation.packages).length
    ).toBeGreaterThanOrEqual(120)
    expect(
      Object.keys(latexDocumentation.documentClasses).length
    ).toBeGreaterThanOrEqual(25)
  })

  it("finds documentation for a recognised command", () => {
    expect(commandDocumentation("includegraphics")).toMatchObject({
      title: "\\includegraphics",
    })
  })

  it("finds documentation for a recognised document class", () => {
    expect(documentClassDocumentation("beamer")).toMatchObject({
      title: "beamer",
    })
  })

  it("finds documentation for the canonical IEEEtran document class", () => {
    expect(documentClassDocumentation("IEEEtran")).toMatchObject({
      title: "IEEEtran",
    })
  })

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

  it("finds documentation for a recognised package", () => {
    expect(packageDocumentation("siunitx")).toMatchObject({
      title: "siunitx",
    })
  })

  it("uses loadable package names in catalog examples", () => {
    expect(packageDocumentation("biblatex-apa")?.markdown).toContain(
      "\\usepackage[style=apa]{biblatex}"
    )
    expect(packageDocumentation("biblatex-apa")?.markdown).not.toContain(
      "\\usepackage{biblatex-apa}"
    )
    expect(packageDocumentation("biblatex-ieee")?.markdown).toContain(
      "\\usepackage[style=ieee]{biblatex}"
    )
    expect(packageDocumentation("biblatex-ieee")?.markdown).not.toContain(
      "\\usepackage{biblatex-ieee}"
    )
    expect(packageDocumentation("cm-super")?.markdown).not.toContain(
      "\\usepackage{cm-super}"
    )
    expect(packageDocumentation("doublestroke")?.markdown).toContain(
      "\\usepackage{dsfont}"
    )
    expect(packageDocumentation("doublestroke")?.markdown).not.toContain(
      "\\usepackage{doublestroke}"
    )
  })

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
    expect(
      Object.keys(latexDocumentation.packages).length
    ).toBeGreaterThanOrEqual(120)
  })

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

  it("documents bibliography and citation commands", () => {
    for (const name of [
      "cite",
      "citep",
      "citeauthor",
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
    expect(commandDocumentation("citepauthor")).toBeUndefined()
    expect(Object.keys(commandsBibliography).length).toBeGreaterThanOrEqual(35)
  })

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
    expect(Object.keys(commandsBeamer).length).toBeGreaterThanOrEqual(30)
  })

  it("uses fenced LaTeX examples for non-obvious beamer commands", () => {
    for (const name of [
      "againframe",
      "beamerdefaultoverlayspecification",
      "onslide",
      "temporal",
      "setbeamercolor",
      "setbeamerfont",
      "setbeamersize",
      "setbeamertemplate",
      "usecolortheme",
      "usefonttheme",
      "useinnertheme",
      "useoutertheme",
      "usetheme",
    ] as const) {
      expect(commandDocumentation(name)?.markdown).toMatch(
        /```latex\n[\s\S]+?\n```/
      )
    }
  })

  it("explains that citepalt is not a natbib command", () => {
    const documentation = commandDocumentation("citepalt")

    expect(documentation).toMatchObject({ title: "\\citepalt" })
    expect(documentation?.markdown).toContain("not provided by `natbib`")
    expect(documentation?.markdown).toContain("\\citealt")
  })

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

  it("identifies wide math accents as core LaTeX commands", () => {
    expect(commandDocumentation("widehat")?.markdown).toBe(
      "Places a wide hat over a multi-character expression."
    )
    expect(commandDocumentation("widetilde")?.markdown).toBe(
      "Places a wide tilde over a multi-character expression."
    )
  })

  it("attributes nolinkurl to hyperref", () => {
    const documentation = commandDocumentation("nolinkurl")

    expect(documentation?.markdown).toContain("It is provided by `hyperref`.")
    expect(documentation?.markdown).not.toContain("`url`")
  })

  it("attributes DeclareCaptionSubType to caption", () => {
    const documentation = commandDocumentation("DeclareCaptionSubType")

    expect(documentation?.markdown).toContain("`caption` package")
    expect(documentation?.markdown).not.toContain("`subcaption` package")
  })

  it("returns undefined for unknown documentation names", () => {
    expect(commandDocumentation("unknowncommand")).toBeUndefined()
    expect(documentClassDocumentation("unknownclass")).toBeUndefined()
    expect(packageDocumentation("unknownpackage")).toBeUndefined()
  })

  it("includes every initially supported catalog entry", () => {
    for (const name of [
      "addbibresource",
      "author",
      "begin",
      "bibliography",
      "chapter",
      "cite",
      "date",
      "documentclass",
      "end",
      "include",
      "includegraphics",
      "input",
      "item",
      "label",
      "maketitle",
      "ref",
      "section",
      "subfile",
      "subsection",
      "title",
      "usepackage",
    ]) {
      expect(commandDocumentation(name)).toBeDefined()
    }
    for (const name of ["article", "beamer", "book", "memoir", "report"]) {
      expect(documentClassDocumentation(name)).toBeDefined()
    }
    for (const name of [
      "amsmath",
      "amssymb",
      "babel",
      "biblatex",
      "booktabs",
      "cleveref",
      "csquotes",
      "fontspec",
      "geometry",
      "graphicx",
      "hyperref",
      "inputenc",
      "microtype",
      "natbib",
      "siunitx",
      "subcaption",
      "subfiles",
      "xcolor",
    ]) {
      expect(packageDocumentation(name)).toBeDefined()
    }
  })

  it("does not expose mutable catalog entries", () => {
    expect(Object.isFrozen(latexDocumentation)).toBe(true)
    expect(Object.isFrozen(commandDocumentation("section"))).toBe(true)
  })

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
})

describe("Markdown hover documentation", () => {
  it("renders supported Markdown as semantic DOM elements", () => {
    const dom = renderMarkdownDocumentation(
      "Example",
      "## Context\n\nA **strong** and *emphasised* `value`.\n\n- First\n- Second\n\n1. One\n2. Two\n\n```latex\n\\section{Results}\n```"
    )

    expect(dom.querySelector("h4")?.textContent).toBe("Context")
    expect(dom.querySelector("strong")?.textContent).toBe("strong")
    expect(dom.querySelector("em")?.textContent).toBe("emphasised")
    expect(dom.querySelector("code")?.textContent).toBe("value")
    expect(dom.querySelectorAll("ul li")).toHaveLength(2)
    expect(dom.querySelectorAll("ol li")).toHaveLength(2)
    expect(dom.querySelector("pre code")?.textContent).toContain(
      "\\section{Results}"
    )
  })

  it("creates safe external links and keeps unsafe markup as text", () => {
    const dom = renderMarkdownDocumentation(
      "Safety",
      "[CTAN](https://ctan.org/pkg/graphicx) [bad](javascript:alert(1)) [invalid](https://) <img src=x>"
    )

    const link = dom.querySelector("a")
    expect(link?.href).toBe("https://ctan.org/pkg/graphicx")
    expect(link?.target).toBe("_blank")
    expect(link?.rel).toBe("noopener noreferrer")
    expect(dom.querySelectorAll("a")).toHaveLength(1)
    expect(dom.querySelector("img")).toBeNull()
    expect(dom.textContent).toContain(
      "[bad](javascript:alert(1)) [invalid](https://) <img src=x>"
    )
  })
})

describe("keywordAt", () => {
  it("recognizes a command from every hover position", () => {
    const source = "\\documentclass{article}"
    const positions = [
      source.indexOf("\\"),
      source.indexOf("d"),
      source.indexOf("u"),
      source.indexOf("s"),
    ]

    for (const position of positions) {
      expect(keywordAt(source, position)?.documentation.title).toBe(
        "\\documentclass"
      )
    }
  })

  it("resolves input references to their project-relative source files", () => {
    const source = "\\input{chapters/introduction}"
    const position = source.indexOf("introduction")

    expect(
      referencedFileAt(source, projectRelativePath("main.tex"), position)
    ).toMatchObject({
      path: "chapters/introduction.tex",
      command: "input",
    })
  })

  it("does not expose commands or file links inside comments", () => {
    const source = "% \\input{draft} and \\section{Old}"

    expect(
      referencedFileAt(
        source,
        projectRelativePath("main.tex"),
        source.indexOf("draft")
      )
    ).toBeNull()
    expect(keywordAt(source, source.indexOf("section"))).toBeNull()
  })
})

describe("hover lookup order", () => {
  const projectPath = canonicalProjectPath("/projects/report")
  const sourcePath = projectRelativePath("main.tex")

  it("recognises every character of every supported command", () => {
    const source =
      "\\documentclass{article}\\usepackage{amsmath}\\begin{document}\\end{document}\\chapter{x}\\section{x}\\subsection{x}\\title{x}\\author{x}\\date{x}\\maketitle\\label{x}\\ref{x}\\cite{x}\\item\\input{x}\\include{x}\\subfile{x}\\bibliography{x}\\addbibresource{x}\\includegraphics{x}"

    for (let index = 0; index < source.length; index += 1) {
      if (source[index] !== "\\") continue
      const command = keywordAt(source, index)
      if (command === null) continue
      for (let position = command.from; position <= command.to; position += 1) {
        expect(keywordAt(source, position)?.documentation).toBeDefined()
      }
    }
  })

  it("documents names in comma-separated class and package groups", async () => {
    const source =
      "\\documentclass{article,report}\\usepackage{amsmath,siunitx}"
    const tooltip = latexHoverTooltip(projectPath, sourcePath)
    const view = new EditorView()

    try {
      for (const name of ["article", "report", "amsmath", "siunitx"]) {
        for (let offset = 0; offset < name.length; offset += 1) {
          const result = await tooltip(
            { state: { doc: { toString: () => source } } },
            source.indexOf(name) + offset
          )
          expect(
            result?.create(view).dom.querySelector("h2")?.textContent
          ).toBe(name)
        }
      }
    } finally {
      view.destroy()
    }
  })

  it("explains unknown classes and packages without claiming local inspection", async () => {
    const source = "\\documentclass{localclass}\\usepackage{localpackage}"
    const tooltip = latexHoverTooltip(projectPath, sourcePath)
    const view = new EditorView()

    try {
      for (const name of ["localclass", "localpackage"]) {
        const result = await tooltip(
          { state: { doc: { toString: () => source } } },
          source.indexOf(name) + 1
        )
        expect(result?.create(view).dom.textContent).toContain(
          "resolved by your configured TeX distribution"
        )
      }
    } finally {
      view.destroy()
    }
  })

  it("keeps file excerpts literal when they contain a Markdown fence", async () => {
    const source = "\\input{chapters/introduction}"
    const tooltip = latexHoverTooltip(projectPath, sourcePath)
    const view = new EditorView()
    const content = "```\n# This remains source text"
    readProjectSource.mockResolvedValueOnce({
      path: projectRelativePath("chapters/introduction.tex"),
      byteLength: content.length,
      content,
      revision: {
        byteLength: content.length,
        contentHash: revisionHash(
          "0000000000000000000000000000000000000000000000000000000000000000"
        ),
      },
    })

    try {
      const result = await tooltip(
        { state: { doc: { toString: () => source } } },
        source.indexOf("introduction")
      )
      const dom = result?.create(view).dom
      expect(dom?.querySelector("pre code")?.textContent).toBe(content)
      expect(dom?.querySelector("h3")).toBeNull()
    } finally {
      view.destroy()
    }
  })
})
