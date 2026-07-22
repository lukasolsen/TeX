import { describe, expect, it } from "vitest"

import { escapeRegExp } from "@/lib/regex"

describe("escapeRegExp", () => {
  it("escapes metacharacters so they match literally", () => {
    const escaped = escapeRegExp("a.b*c?")
    expect(new RegExp(escaped).test("a.b*c?")).toBe(true)
    expect(new RegExp(escaped).test("axbxc")).toBe(false)
  })

  it("leaves ordinary characters untouched", () => {
    expect(escapeRegExp("plain text 123")).toBe("plain text 123")
  })

  it("escapes backslashes and brackets", () => {
    expect(escapeRegExp("[a\\b]")).toBe("\\[a\\\\b\\]")
  })
})
