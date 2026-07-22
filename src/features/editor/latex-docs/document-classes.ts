import {
  entry,
  type LatexDocumentation,
} from "@/features/editor/latex-docs/entry"

export const documentClasses = {
  acmart: entry(
    "acmart",
    "For articles submitted to ACM journals and conferences. It provides ACM metadata, author/affiliation commands, and venue-specific layouts.\n\n```latex\n\\documentclass[sigconf]{acmart}\n```\n\nSelect the option required by the target venue and use its author declarations instead of hand-formatting a title block. [acmart on CTAN](https://ctan.org/pkg/acmart)"
  ),
  amsart: entry(
    "amsart",
    "For mathematical journal articles following American Mathematical Society conventions. It supplies AMS theorem-friendly typography and a structured author/address setup.\n\n```latex\n\\documentclass{amsart}\n```\n\nUse `\\address`, `\\email`, and AMS theorem environments where the journal permits them. [amscls on CTAN](https://ctan.org/pkg/amscls)"
  ),
  amsbook: entry(
    "amsbook",
    "For mathematical books and monographs using American Mathematical Society conventions. It supports chapters, front matter, and AMS-oriented theorem and author metadata.\n\n```latex\n\\documentclass{amsbook}\n```\n\nIt is a book-class workflow, so organize long material with `\\chapter` and front/back matter commands. [amscls on CTAN](https://ctan.org/pkg/amscls)"
  ),
  amsproc: entry(
    "amsproc",
    "For mathematical proceedings articles in the AMS class family. It is article-like but provides the AMS title, author, and address conventions.\n\n```latex\n\\documentclass{amsproc}\n```\n\nUse it for proceedings only when the publisher or organizer requests it; it does not provide chapter-level structure. [amscls on CTAN](https://ctan.org/pkg/amscls)"
  ),
  article: entry(
    "article",
    "For short papers, articles, and reports without chapters. It provides sectioning, a title block, and standard typography.\n\n```latex\n\\documentclass[11pt]{article}\n```\n\nUse `report` or `book` when chapter-level structure is needed. [LaTeX classes](https://latexref.xyz/Document-classes.html)"
  ),
  beamer: entry(
    "beamer",
    "For presentation slides, overlays, and speaker-oriented material. It provides frames, themes, and incremental reveals.\n\n```latex\n\\documentclass{beamer}\n```\n\nPut slide content in `frame` environments; themes can change layout substantially, so establish content before extensive theming. [beamer on CTAN](https://ctan.org/pkg/beamer)"
  ),
  book: entry(
    "book",
    "For long, book-like documents with chapters, front matter, and back matter. It is appropriate for theses only when local requirements permit it.\n\n```latex\n\\documentclass[12pt]{book}\n```\n\nIts two-sided and chapter-opening defaults differ from `report`; use `\\frontmatter`, `\\mainmatter`, and `\\backmatter` to structure a book. [LaTeX classes](https://latexref.xyz/Document-classes.html)"
  ),
  extarticle: entry(
    "extarticle",
    "An `article`-compatible class with support for larger base font sizes, including 14pt, 17pt, and 20pt.\n\n```latex\n\\documentclass[14pt]{extarticle}\n```\n\nIts document structure is the same as `article`; use it when a larger base size is a real requirement rather than scaling the final PDF. [extsizes on CTAN](https://ctan.org/pkg/extsizes)"
  ),
  extbook: entry(
    "extbook",
    "A `book`-compatible class with larger base font sizes from the extsizes bundle.\n\n```latex\n\\documentclass[17pt]{extbook}\n```\n\nIt retains `book` chapters and front/main/back matter while offering base font sizes beyond the standard classes. [extsizes on CTAN](https://ctan.org/pkg/extsizes)"
  ),
  extreport: entry(
    "extreport",
    "A `report`-compatible class with larger base font sizes from the extsizes bundle.\n\n```latex\n\\documentclass[14pt]{extreport}\n```\n\nIt keeps `report`'s chapter structure and is useful when a project needs a supported large base font. [extsizes on CTAN](https://ctan.org/pkg/extsizes)"
  ),
  hitec: entry(
    "hitec",
    "For proceedings of the HI-TEC conference, using a dedicated two-column proceedings layout.\n\n```latex\n\\documentclass{hitec}\n```\n\nUse this specialized class only for a venue that supplies or requests it, and follow that venue's submission instructions. [hitec on CTAN](https://ctan.org/pkg/hitec)"
  ),
  IEEEtran: entry(
    "IEEEtran",
    "For IEEE conference and journal papers, providing IEEE title blocks, author formatting, and publication layouts.\n\n```latex\n\\documentclass[conference]{IEEEtran}\n```\n\nClass names are case-sensitive in the source: use `IEEEtran`; select the required journal or conference option and follow IEEE's current author guidance. [IEEEtran on CTAN](https://ctan.org/pkg/ieeetran)"
  ),
  ieeetran: entry(
    "ieeetran",
    "For IEEE conference and journal papers, providing IEEE title blocks, author formatting, and publication layouts.\n\n```latex\n\\documentclass[conference]{IEEEtran}\n```\n\nClass names are case-sensitive in the source: use `IEEEtran`; select the required journal or conference option and follow IEEE's current author guidance. [IEEEtran on CTAN](https://ctan.org/pkg/ieeetran)"
  ),
  letter: entry(
    "letter",
    "For formal correspondence with sender, recipient, opening, closing, and signature commands.\n\n```latex\n\\documentclass{letter}\n```\n\nWrite each message in a `letter` environment and set reusable sender data such as `\\address` and `\\signature`. [LaTeX classes](https://latexref.xyz/Document-classes.html)"
  ),
  ltnews: entry(
    "ltnews",
    "For issues of LaTeX News, the newsletter distributed with LaTeX releases.\n\n```latex\n\\documentclass{ltnews}\n```\n\nThis is a specialized maintenance class rather than a general newsletter template; use it when working on LaTeX News source. [ltnews on CTAN](https://ctan.org/pkg/ltnews)"
  ),
  ltxdoc: entry(
    "ltxdoc",
    "For documenting LaTeX classes and packages, with support for code-and-documentation source files.\n\n```latex\n\\documentclass{ltxdoc}\n```\n\nIt is commonly used with documented `.dtx` sources and tools such as `docstrip`, rather than as an ordinary article class. [ltxdoc on CTAN](https://ctan.org/pkg/ltxdoc)"
  ),
  memoir: entry(
    "memoir",
    "A configurable book and report class that combines many layout and typesetting features in one class.\n\n```latex\n\\documentclass[11pt]{memoir}\n```\n\nIt replaces many common layout packages; read its documentation before adding packages that alter page layout or headings. [memoir on CTAN](https://ctan.org/pkg/memoir)"
  ),
  minimal: entry(
    "minimal",
    "A bare-bones class that provides almost no formatting or structure. It is useful for testing or very specialized documents.\n\n```latex\n\\documentclass{minimal}\n```\n\nIt does not provide normal sectioning or title commands, so treat it as a diagnostic starting point rather than a general writing class. [minimal on CTAN](https://ctan.org/pkg/minimal)"
  ),
  moderncv: entry(
    "moderncv",
    "For curricula vitae and résumés, with configurable styles, color themes, and structured personal-information commands.\n\n```latex\n\\documentclass[11pt,a4paper,sans]{moderncv}\n```\n\nSet identity details with commands such as `\\name` and `\\email`, then organize content with `\\section` and `\\cventry`. [moderncv on CTAN](https://ctan.org/pkg/moderncv)"
  ),
  octavo: entry(
    "octavo",
    "For typesetting books in the octavo format, with page design intended for small printed volumes.\n\n```latex\n\\documentclass{octavo}\n```\n\nIt is a specialized book-design class; verify printer, trim-size, and binding requirements before adopting its defaults. [octavo on CTAN](https://ctan.org/pkg/octavo)"
  ),
  proc: entry(
    "proc",
    "For proceedings-style articles using the standard LaTeX class family. It is similar to `article` but adjusts title and abstract presentation for collections.\n\n```latex\n\\documentclass{proc}\n```\n\nIt remains article-like, so it has sections rather than chapters; use a publisher's dedicated class if one is provided. [LaTeX classes](https://latexref.xyz/Document-classes.html)"
  ),
  report: entry(
    "report",
    "For multi-chapter reports, dissertations, and technical documents. It adds `\\chapter` while keeping a conventional article-like workflow.\n\n```latex\n\\documentclass[12pt]{report}\n```\n\nCheck institutional templates before changing its title-page or margin defaults; it does not include `book`'s front/main/back matter commands. [LaTeX classes](https://latexref.xyz/Document-classes.html)"
  ),
  "revtex4-1": entry(
    "revtex4-1",
    "For legacy American Physical Society and American Institute of Physics manuscripts that specifically require REVTeX 4.1.\n\n```latex\n\\documentclass[aps,prl,twocolumn]{revtex4-1}\n```\n\nUse this version only when a journal workflow requires it; newer APS submissions generally use `revtex4-2`. [revtex on CTAN](https://ctan.org/pkg/revtex)"
  ),
  "revtex4-2": entry(
    "revtex4-2",
    "For American Physical Society and American Institute of Physics journal manuscripts using REVTeX 4.2.\n\n```latex\n\\documentclass[aps,prl,twocolumn]{revtex4-2}\n```\n\nChoose society and journal options required by the target publication; REVTeX supplies its own affiliation and bibliography conventions. [revtex on CTAN](https://ctan.org/pkg/revtex)"
  ),
  scrartcl: entry(
    "scrartcl",
    "KOMA-Script's article class, designed for European typographic conventions and configurable document layout.\n\n```latex\n\\documentclass[11pt]{scrartcl}\n```\n\nIt is structurally article-like; use KOMA-Script options and commands for headings and typography instead of mixing incompatible layout packages. [KOMA-Script on CTAN](https://ctan.org/pkg/koma-script)"
  ),
  scrbook: entry(
    "scrbook",
    "KOMA-Script's book class, with chapters, book matter divisions, and configurable page design.\n\n```latex\n\\documentclass[12pt]{scrbook}\n```\n\nUse it for long book-style work and configure KOMA-Script features consistently rather than layering standard-class layout assumptions on top. [KOMA-Script on CTAN](https://ctan.org/pkg/koma-script)"
  ),
  scrlttr2: entry(
    "scrlttr2",
    "KOMA-Script's configurable letter class, including letter options and reusable letterhead variables.\n\n```latex\n\\documentclass{scrlttr2}\n```\n\nCreate letters in `letter` environments and use KOMA-Script variables for addresses, subject lines, and layout. [KOMA-Script on CTAN](https://ctan.org/pkg/koma-script)"
  ),
  scrreprt: entry(
    "scrreprt",
    "KOMA-Script's report class, providing chapter-level structure with configurable typography and headings.\n\n```latex\n\\documentclass[12pt]{scrreprt}\n```\n\nIt is the KOMA-Script counterpart to `report`; use `\\chapter` for top-level divisions and KOMA options for presentation. [KOMA-Script on CTAN](https://ctan.org/pkg/koma-script)"
  ),
  slides: entry(
    "slides",
    "For simple presentation slides with a minimalistic style. It is an older class and less feature-rich than `beamer`.\n\n```latex\n\\documentclass{slides}\n```\n\nConsider `beamer` for modern presentations; `slides` is mostly for legacy documents. [LaTeX classes](https://latexref.xyz/Document-classes.html)"
  ),
  standalone: entry(
    "standalone",
    "For compiling a figure, diagram, or other fragment as its own tightly cropped document.\n\n```latex\n\\documentclass[tikz]{standalone}\n```\n\nIt is commonly used for TikZ artwork that will later be included in a larger document; choose its crop and conversion options deliberately. [standalone on CTAN](https://ctan.org/pkg/standalone)"
  ),
  "tufte-book": entry(
    "tufte-book",
    "For book-length documents using a Tufte-inspired layout with wide margins, sidenotes, and full-width figures.\n\n```latex\n\\documentclass{tufte-book}\n```\n\nIts visual structure is intentionally distinctive, so use its `\\sidenote` and margin-aware environments rather than forcing a conventional layout. [tufte-latex on CTAN](https://ctan.org/pkg/tufte-latex)"
  ),
  "tufte-handout": entry(
    "tufte-handout",
    "For shorter Tufte-inspired handouts with sidenotes and margin figures.\n\n```latex\n\\documentclass{tufte-handout}\n```\n\nIt is article-like and intended for handouts rather than chapters; reserve the margin for notes and supporting material. [tufte-latex on CTAN](https://ctan.org/pkg/tufte-latex)"
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
