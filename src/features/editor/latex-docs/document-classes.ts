import { entry, type LatexDocumentation } from "@/features/editor/latex-docs/entry"

export const documentClasses = {
  article: entry(
    "article",
    "For short papers, articles, and reports without chapters. It provides sectioning, a title block, and standard typography.\n\n```latex\n\\documentclass[11pt]{article}\n```\n\nUse `report` or `book` when chapter-level structure is needed. [LaTeX classes](https://latexref.xyz/Document-classes.html)"
  ),
  beamer: entry(
    "beamer",
    "For presentation slides, overlays, and speaker-oriented material. It provides frames, themes, and incremental reveals.\n\n```latex\n\\documentclass{beamer}\n```\n\nSlide themes can change layout substantially; start with content before extensive theming. [beamer on CTAN](https://ctan.org/pkg/beamer)"
  ),
  book: entry(
    "book",
    "For long, book-like documents with chapters, front matter, and back matter. It is appropriate for theses only when local requirements permit it.\n\n```latex\n\\documentclass[12pt]{book}\n```\n\nIts two-sided and chapter-opening defaults differ from `report`. [LaTeX classes](https://latexref.xyz/Document-classes.html)"
  ),
  memoir: entry(
    "memoir",
    "A configurable book and report class that combines many layout and typesetting features in one class.\n\n```latex\n\\documentclass[11pt]{memoir}\n```\n\nRead its documentation before adding packages that alter page layout or headings. [memoir on CTAN](https://ctan.org/pkg/memoir)"
  ),
  report: entry(
    "report",
    "For multi-chapter reports, dissertations, and technical documents. It adds `\\chapter` while keeping a conventional article-like workflow.\n\n```latex\n\\documentclass[12pt]{report}\n```\n\nCheck institutional templates before changing its title-page or margin defaults. [LaTeX classes](https://latexref.xyz/Document-classes.html)"
  ),
  slides: entry(
    "slides",
    "For simple presentation slides with a minimalistic style. It is an older class and less feature-rich than `beamer`.\n\n```latex\n\\documentclass{slides}\n```\n\nConsider `beamer` for modern presentations; `slides` is mostly for legacy documents. [LaTeX classes](https://latexref.xyz/Document-classes.html)"
  ),
  minimal: entry(
    "minimal",
    "A bare-bones class that provides almost no formatting or structure. It is useful for testing or very specialized documents.\n\n```latex\n\\documentclass{minimal}\n```\n\nIt does not support sections, titles, or standard document features. [LaTeX classes](https://latexref.xyz/Document-classes.html)"
  ),
  ieeetran: entry(
    "ieeetran",
    "A class for IEEE conference and journal papers, providing the correct formatting and layout.\n\n```latex\n\\documentclass[conference]{ieeetran}\n```\n\nFollow IEEE guidelines for submission; it is not compatible with all packages. [ieeetran on CTAN](https://ctan.org/pkg/ieeetran)"
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
