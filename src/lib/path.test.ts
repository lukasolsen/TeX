import { describe, expect, it } from "vitest"

import type {
  CanonicalProjectPath,
  ProjectRelativePath,
} from "@/domain/identifiers"
import { absoluteDisplayPath } from "@/lib/path"

const project = (value: string): CanonicalProjectPath =>
  value as CanonicalProjectPath
const relative = (value: string): ProjectRelativePath =>
  value as ProjectRelativePath

describe("absoluteDisplayPath", () => {
  it("joins a POSIX root with a forward slash", () => {
    expect(
      absoluteDisplayPath(project("/home/user/proj"), relative("src/main.tex"))
    ).toBe("/home/user/proj/src/main.tex")
  })

  it("uses backslashes and converts the child for a Windows root", () => {
    expect(
      absoluteDisplayPath(
        project("C:\\Users\\me\\proj"),
        relative("src/main.tex")
      )
    ).toBe("C:\\Users\\me\\proj\\src\\main.tex")
  })

  it("does not double the separator when the root has a trailing slash", () => {
    expect(
      absoluteDisplayPath(project("/home/user/proj/"), relative("a.tex"))
    ).toBe("/home/user/proj/a.tex")
  })
})
