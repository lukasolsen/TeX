import { describe, expect, it } from "vitest"

import {
  imageMediaType,
  isImageFile,
  isLatexSource,
  isOpenableFile,
  isPdfFile,
  isTextFile,
  projectFileKind,
} from "@/domain/file-kind"

describe("projectFileKind", () => {
  it("classifies the surfaces a project file can open in", () => {
    expect(projectFileKind("sources/MAIN.TEX")).toBe("latexSource")
    expect(projectFileKind("main.log")).toBe("text")
    expect(projectFileKind("figures/plot.PNG")).toBe("image")
    expect(projectFileKind("main.pdf")).toBe("pdf")
    expect(projectFileKind("fonts/cmr10.pfb")).toBe("unsupported")
  })

  it("separates LaTeX assistance from what the editor can open", () => {
    expect(isLatexSource("chapters/intro.tex")).toBe(true)
    expect(isLatexSource("main.log")).toBe(false)
    expect(isTextFile("main.log")).toBe(true)
    expect(isTextFile("chapters/intro.tex")).toBe(true)
    expect(isTextFile("figures/plot.png")).toBe(false)
  })

  it("matches extensionless project files by name", () => {
    expect(projectFileKind("Makefile")).toBe("text")
    expect(projectFileKind(".latexmkrc")).toBe("text")
    expect(projectFileKind("build/.gitignore")).toBe("text")
    expect(projectFileKind("figures")).toBe("unsupported")
  })

  it("reports a media type only for images it can render", () => {
    expect(imageMediaType("figures/diagram.svg")).toBe("image/svg+xml")
    expect(imageMediaType("figures/photo.jpeg")).toBe("image/jpeg")
    expect(imageMediaType("figures/scan.tiff")).toBe(null)
    expect(isImageFile("figures/scan.tiff")).toBe(false)
  })

  it("agrees with the single-kind predicates", () => {
    expect(isPdfFile("figures/CHART.PDF")).toBe(true)
    expect(isImageFile("figures/chart.webp")).toBe(true)
    expect(isOpenableFile("figures/chart.webp")).toBe(true)
    expect(isOpenableFile("figures/chart.eps")).toBe(false)
  })
})
