/**
 * A structural reading of a Markdown file.
 *
 * Only the constructs the editor acts on are modelled: the headings and blocks
 * folding collapses, and the list and quote markers Enter continues. Fenced
 * code is tracked throughout because a `#` inside a fence is code, not a
 * heading, and folding a section that started there would collapse the wrong
 * range.
 */

export type MarkdownFoldRange = Readonly<{
  /** End of the line the block opens on: the fold starts after it. */
  from: number
  to: number
  kind: "heading" | "fence" | "front-matter"
  /** What was folded, for the placeholder's accessible name. */
  name: string
}>

const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*#*[ \t]*$/
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/

type Line = Readonly<{ text: string; from: number; to: number; number: number }>

function linesOf(content: string): Line[] {
  const lines: Line[] = []
  let from = 0
  let number = 1
  for (const text of content.split("\n")) {
    lines.push({ text, from, to: from + text.length, number })
    from += text.length + 1
    number += 1
  }
  return lines
}

type Heading = Readonly<{ level: number; name: string; line: Line }>

/**
 * The fold ranges of a Markdown document, keyed by the 1-based line they start
 * on. A block that opens and closes on one line is not foldable, and where two
 * blocks open on the same line the larger one wins.
 */
export function markdownFoldRanges(
  content: string
): Map<number, MarkdownFoldRange> {
  const lines = linesOf(content)
  const ranges = new Map<number, MarkdownFoldRange>()
  const offer = (range: MarkdownFoldRange, line: Line) => {
    if (range.to <= range.from) return
    const existing = ranges.get(line.number)
    if (existing === undefined || range.to > existing.to) {
      ranges.set(line.number, range)
    }
  }

  const headings: Heading[] = []
  let fence: { marker: string; line: Line } | null = null
  let frontMatter: Line | null = null

  for (const [index, line] of lines.entries()) {
    if (index === 0 && lines.length > 1 && /^---[ \t]*$/.test(line.text)) {
      frontMatter = line
      continue
    }
    if (frontMatter !== null) {
      if (!/^(---|\.\.\.)[ \t]*$/.test(line.text)) continue
      offer(
        {
          from: frontMatter.to,
          to: line.to,
          kind: "front-matter",
          name: "front matter",
        },
        frontMatter
      )
      frontMatter = null
      continue
    }

    const fenceMatch = FENCE.exec(line.text)
    if (fence !== null) {
      if (
        fenceMatch !== null &&
        (fenceMatch[1] ?? "").startsWith(fence.marker[0] ?? "") &&
        (fenceMatch[1] ?? "").length >= fence.marker.length &&
        (fenceMatch[2] ?? "").trim() === ""
      ) {
        offer(
          { from: fence.line.to, to: line.to, kind: "fence", name: "code" },
          fence.line
        )
        fence = null
      }
      continue
    }
    if (fenceMatch !== null) {
      fence = { marker: fenceMatch[1] ?? "", line }
      continue
    }

    const atx = ATX_HEADING.exec(line.text)
    if (atx !== null) {
      headings.push({
        level: (atx[1] ?? "").length,
        name: (atx[2] ?? "").trim(),
        line,
      })
      continue
    }
    // A setext underline turns the line above it into a heading, which
    // outranks reading `---` as a thematic break.
    const setext = SETEXT.exec(line.text)
    const previous = lines[index - 1]
    if (
      setext !== null &&
      previous !== undefined &&
      previous.text.trim() !== "" &&
      !THEMATIC_BREAK.test(previous.text) &&
      headings.at(-1)?.line.number !== previous.number
    ) {
      headings.push({
        level: (setext[1] ?? "").startsWith("=") ? 1 : 2,
        name: previous.text.trim(),
        line: previous,
      })
    }
  }

  if (fence !== null) {
    const last = lines.at(-1)
    if (last !== undefined) {
      offer(
        { from: fence.line.to, to: last.to, kind: "fence", name: "code" },
        fence.line
      )
    }
  }

  const end = lines.at(-1)?.to ?? content.length
  for (const [index, heading] of headings.entries()) {
    // A heading runs until the next heading of the same or shallower depth.
    const next = headings
      .slice(index + 1)
      .find((candidate) => candidate.level <= heading.level)
    const limit =
      next === undefined ? end : (lines[next.line.number - 2]?.to ?? end)
    offer(
      {
        from: heading.line.to,
        to: limit,
        kind: "heading",
        name: heading.name === "" ? "section" : heading.name,
      },
      heading.line
    )
  }

  return ranges
}

export type MarkdownListItem = Readonly<{
  /** Indentation, quote markers, list marker, and the spacing after it. */
  prefix: string
  /** What the author has written after the marker. */
  content: string
  /** The prefix a continuation line starts with, with an ordered number advanced. */
  next: string
}>

const QUOTE = /^([ \t]*(?:>[ \t]?)+)/
const LIST =
  /^([ \t]*)(?:([-+*])|(\d{1,9})([.)]))(?:([ \t]+)|$)(\[[ xX]\][ \t]+)?/

/**
 * The list item or block quote a line continues, or `null` for ordinary text.
 *
 * An item whose `content` is empty is one the author has finished: pressing
 * Enter there is a request to leave the list, not to add another marker.
 */
export function markdownListItemAt(line: string): MarkdownListItem | null {
  const quote = QUOTE.exec(line)?.[1] ?? ""
  const rest = line.slice(quote.length)
  const list = LIST.exec(rest)
  if (list === null) {
    if (quote === "") return null
    return { prefix: quote, content: rest, next: quote }
  }
  const [marker, indent, bullet, ordered, delimiter, spacing, task] = list
  const nextMarker =
    bullet ?? `${Math.trunc(Number(ordered ?? "0")) + 1}${delimiter ?? "."}`
  return {
    prefix: quote + (marker ?? ""),
    content: rest.slice((marker ?? "").length),
    next: `${quote}${indent ?? ""}${nextMarker}${spacing ?? " "}${
      task === undefined ? "" : "[ ] "
    }`,
  }
}
