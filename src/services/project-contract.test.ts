import { describe, expect, it } from "vitest"

import {
  parseForwardSearchResult,
  parseProjectSummary,
  parseReplaceResponse,
  parseSourceDocument,
} from "@/services/project-contract"

describe("project IPC contracts", () => {
  it("accepts a bounded source document with a coherent revision", () => {
    expect(
      parseSourceDocument({
        path: "main.tex",
        content: "content",
        byteLength: 7,
        revision: {
          byteLength: 7,
          contentHash: "a".repeat(64),
        },
      })
    ).toMatchObject({ path: "main.tex", byteLength: 7 })
  })

  it("rejects malformed hashes and incoherent revision lengths", () => {
    expect(() =>
      parseSourceDocument({
        path: "main.tex",
        content: "content",
        byteLength: 7,
        revision: { byteLength: 6, contentHash: "not-a-hash" },
      })
    ).toThrow("invalid source hash")
  })

  it("rejects project trees beyond the Rust depth contract", () => {
    let tree: unknown = { name: "leaf", kind: "file", children: [] }
    for (let depth = 0; depth < 15; depth += 1) {
      tree = { name: `level-${depth}`, kind: "directory", children: [tree] }
    }
    expect(() =>
      parseProjectSummary({
        name: "Project",
        path: "/project",
        tree,
        rootCandidates: [],
        rootDetectionNote: null,
        persistenceNote: null,
      })
    ).toThrow("invalid project tree")
  })

  it("rejects non-finite SyncTeX coordinates and malformed transactions", () => {
    expect(() => parseForwardSearchResult({ page: 1, x: Number.NaN, y: 2 })).toThrow(
      "invalid SyncTeX x coordinate"
    )
    expect(() =>
      parseReplaceResponse({
        transactionId: "abc",
        changedFiles: 1,
        replacedMatches: 1,
      })
    ).toThrow("invalid replace transaction")
  })
})
