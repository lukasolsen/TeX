import { describe, expect, it } from "vitest"

import { bibtexCompletionContextAt, bibtexEntries } from "@/domain/bibtex"

describe("bibtexEntries", () => {
  it("reads a type, a key, and the fields of an entry", () => {
    const [entry] = bibtexEntries(
      '@article{knuth1984,\n  author = {Knuth},\n  title = "TeX",\n}\n'
    )

    expect(entry?.type).toBe("article")
    expect(entry?.key).toBe("knuth1984")
    expect(entry?.fields).toEqual(["author", "title"])
    expect(entry?.closed).toBe(true)
  })

  it("keeps braces and quotes inside a value out of the structure", () => {
    const [entry] = bibtexEntries(
      '@book{k,\n  title = {A {Nested} Title, With a Comma},\n  note = "a } brace",\n}'
    )

    expect(entry?.key).toBe("k")
    expect(entry?.fields).toEqual(["title", "note"])
  })

  it("ignores text between entries and `%` comments", () => {
    const entries = bibtexEntries(
      "Notes BibTeX never reads.\n% @article{ignored,\n@misc{real, title = {t}}"
    )

    expect(entries.map((entry) => entry.key)).toEqual(["real"])
  })

  it("names no key for entries that do not carry one", () => {
    const [entry] = bibtexEntries('@string{tex = "TeX"}')

    expect(entry?.type).toBe("string")
    expect(entry?.key).toBeNull()
    expect(entry?.fields).toEqual(["tex"])
  })

  it("reports an entry that is still being typed", () => {
    const [entry] = bibtexEntries("@article{draft,\n  author = {")

    expect(entry?.closed).toBe(false)
    expect(entry?.key).toBe("draft")
  })
})

describe("bibtexCompletionContextAt", () => {
  it("offers entry types where one is being typed", () => {
    const content = "@art"
    const context = bibtexCompletionContextAt(content, content.length)

    expect(context).toEqual({
      kind: "entry-type",
      from: 0,
      to: 4,
      query: "art",
    })
  })

  it("offers fields inside an entry, with the ones already used reported", () => {
    const content = "@article{k,\n  author = {A},\n  ti"

    expect(bibtexCompletionContextAt(content, content.length)).toEqual({
      kind: "field",
      from: content.length - 2,
      to: content.length,
      query: "ti",
      entryType: "article",
      present: ["author"],
    })
  })

  it("stays silent inside a value, a key, and a comment", () => {
    const inValue = "@article{k, author = {Kn"
    expect(bibtexCompletionContextAt(inValue, inValue.length)).toBeNull()

    const inKey = "@article{knu"
    expect(bibtexCompletionContextAt(inKey, inKey.length)).toBeNull()

    const inComment = "% @art"
    expect(bibtexCompletionContextAt(inComment, inComment.length)).toBeNull()
  })

  it("stays silent in the free text between entries", () => {
    const content = "@misc{a, title = {t}}\nloose text"
    expect(bibtexCompletionContextAt(content, content.length)).toBeNull()
  })
})
