export type DocumentOutlineItem = {
  command: string
  level: number
  line: number
  title: string
}

const sectionLevels: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
}

function visibleTitle(value: string): string {
  return value
    .replace(
      /\\(?:texorpdfstring|emph|textbf|textit|texttt)\s*\{([^{}]*)\}(?:\{[^{}]*\})?/g,
      "$1"
    )
    .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?\{([^{}]*)\}/g, "$1")
    .replace(/\\[a-zA-Z@]+\*?/g, "")
    .replace(/\\([%#&_{}])/g, "$1")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function contentBeforeComment(line: string): string {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== "%") continue
    let escapes = 0
    for (
      let cursor = index - 1;
      cursor >= 0 && line[cursor] === "\\";
      cursor -= 1
    )
      escapes += 1
    if (escapes % 2 === 0) return line.slice(0, index)
  }
  return line
}

/** Extracts navigable LaTeX section commands without claiming full TeX semantics. */
export function documentOutline(content: string): DocumentOutlineItem[] {
  const items: DocumentOutlineItem[] = []
  const commandPattern =
    /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?(?:\s*\[[^\]]*\])?\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g

  content.split(/\r?\n/).forEach((rawLine, index) => {
    const line = contentBeforeComment(rawLine)
    for (const match of line.matchAll(commandPattern)) {
      const command = match[1]
      const rawTitle = match[2]
      if (command === undefined || rawTitle === undefined) continue
      const title = visibleTitle(rawTitle)
      if (title === "") continue
      items.push({
        command,
        level: sectionLevels[command] ?? 2,
        line: index + 1,
        title,
      })
    }
  })

  return items
}
