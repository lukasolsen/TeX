import { describe, expect, it } from "vitest"

import { markdownFoldRanges, markdownListItemAt } from "@/domain/markdown"

/** The 1-based lines a fold starts on, with what each one holds. */
function folds(content: string): Array<[number, string]> {
  return [...markdownFoldRanges(content).entries()]
    .map(([line, range]): [number, string] => [line, range.name])
    .toSorted(([a], [b]) => a - b)
}

/** The 1-based line a fold ends on. */
function foldEnd(content: string, line: number): number {
  const range = markdownFoldRanges(content).get(line)
  if (range === undefined) throw new Error(`no fold on line ${line}`)
  return content.slice(0, range.to).split("\n").length
}

describe("markdownFoldRanges", () => {
  it("folds a heading down to the next heading of the same depth", () => {
    const content = ["# One", "text", "## Two", "more", "# Three", "last"].join(
      "\n"
    )

    expect(folds(content)).toEqual([
      [1, "One"],
      [3, "Two"],
      [5, "Three"],
    ])
    expect(foldEnd(content, 1)).toBe(4)
    expect(foldEnd(content, 5)).toBe(6)
  })

  it("folds a fenced block and ignores the markup inside it", () => {
    const content = ["# One", "```sh", "# not a heading", "```", "after"].join(
      "\n"
    )

    expect(folds(content)).toEqual([
      [1, "One"],
      [2, "code"],
    ])
    expect(foldEnd(content, 2)).toBe(4)
  })

  it("folds front matter as a unit", () => {
    const content = ["---", "title: Notes", "---", "# One", "text"].join("\n")

    expect(folds(content)).toEqual([
      [1, "front matter"],
      [4, "One"],
    ])
    expect(foldEnd(content, 1)).toBe(3)
  })

  it("treats an underlined line as the heading it names", () => {
    const content = ["Title", "=====", "text", "Other", "-----", "more"].join(
      "\n"
    )

    expect(folds(content)).toEqual([
      [1, "Title"],
      [4, "Other"],
    ])
  })

  it("offers no fold for a block that opens and closes on one line", () => {
    expect(folds("# One")).toEqual([])
  })
})

describe("markdownListItemAt", () => {
  it("continues a bullet", () => {
    expect(markdownListItemAt("- first")?.next).toBe("- ")
    expect(markdownListItemAt("  * first")?.next).toBe("  * ")
  })

  it("advances an ordered marker", () => {
    expect(markdownListItemAt("3. third")?.next).toBe("4. ")
    expect(markdownListItemAt("9) ninth")?.next).toBe("10) ")
  })

  it("continues a task list with an unchecked box", () => {
    expect(markdownListItemAt("- [x] done")?.next).toBe("- [ ] ")
  })

  it("continues a block quote, including one holding a list", () => {
    expect(markdownListItemAt("> quoted")?.next).toBe("> ")
    expect(markdownListItemAt("> - item")?.next).toBe("> - ")
  })

  it("reports an empty item, which is the one that ends a list", () => {
    expect(markdownListItemAt("- ")?.content.trim()).toBe("")
    expect(markdownListItemAt("-")?.content.trim()).toBe("")
  })

  it("leaves ordinary text alone", () => {
    expect(markdownListItemAt("plain text")).toBeNull()
    expect(markdownListItemAt("*emphasis* first")).toBeNull()
  })
})
