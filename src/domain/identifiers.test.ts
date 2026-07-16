import { describe, expect, it } from "vitest"

import {
  buildId,
  canonicalProjectPath,
  projectRelativePath,
  revisionHash,
} from "@/domain/identifiers"

describe("opaque IPC identifiers", () => {
  it("normalizes project-relative separators and rejects traversal", () => {
    expect(projectRelativePath("chapters\\intro.tex")).toBe("chapters/intro.tex")
    expect(() => projectRelativePath("../outside.tex")).toThrow(
      "Project-relative path is invalid"
    )
  })

  it("requires absolute roots and exact backend identifier shapes", () => {
    expect(canonicalProjectPath("/project")).toBe("/project")
    expect(buildId("42-7")).toBe("42-7")
    expect(revisionHash("a".repeat(64))).toHaveLength(64)
    expect(() => buildId("run-7")).toThrow("Build ID is invalid")
  })
})
