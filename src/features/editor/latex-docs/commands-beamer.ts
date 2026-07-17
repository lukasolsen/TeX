import {
  entry,
  type LatexDocumentation,
} from "@/features/editor/latex-docs/entry"

const command = (name: string, markdown: string): LatexDocumentation =>
  entry(`\\${name}`, markdown)

export const commandsBeamer = {
  AtBeginSection: command(
    "AtBeginSection",
    "Registers material that Beamer inserts at the start of every `\\section`, commonly an outline frame. Define it in the preamble."
  ),
  AtBeginSubsection: command(
    "AtBeginSubsection",
    "Registers material that Beamer inserts at the start of every `\\subsection`, commonly a more detailed outline frame. Define it in the preamble."
  ),
  againframe: command(
    "againframe",
    "Replays a frame previously given a `label` option. Use it for a recap without duplicating the frame source.\n\n```latex\n\\begin{frame}[label=summary]\n  Summary\n\\end{frame}\n\\againframe{summary}\n```"
  ),
  alert: command(
    "alert",
    "Emphasises its argument using Beamer's alert style. An overlay specification can restrict the emphasis to selected slides, as in `\\alert<2>{important}`."
  ),
  alt: command(
    "alt",
    "Chooses between two arguments by overlay specification: `\\alt<2>{shown on slide 2}{shown otherwise}`."
  ),
  beamerdefaultoverlayspecification: command(
    "beamerdefaultoverlayspecification",
    "Sets the default overlay specification Beamer uses when an overlay-aware command has none explicitly.\n\n```latex\n\\beamerdefaultoverlayspecification{<+->}\n```"
  ),
  framesubtitle: command(
    "framesubtitle",
    "Sets the subtitle shown with the current frame title. Use it inside a `frame` environment after `\\frametitle`."
  ),
  frametitle: command(
    "frametitle",
    "Sets the title displayed at the top of the current Beamer frame. Frame content normally belongs in `\\begin{frame}` … `\\end{frame}`; use this command inside that environment."
  ),
  hyperlinkslidenext: command(
    "hyperlinkslidenext",
    "Creates a hyperlink to the next slide, using its argument as the linked text. It is useful in custom navigation templates."
  ),
  hyperlinkslideprev: command(
    "hyperlinkslideprev",
    "Creates a hyperlink to the previous slide, using its argument as the linked text. It is useful in custom navigation templates."
  ),
  insertframenumber: command(
    "insertframenumber",
    "Expands to the number of the current Beamer frame. It is commonly used in a footline template."
  ),
  insertsection: command(
    "insertsection",
    "Expands to the current section title for use in Beamer templates such as headlines and footlines."
  ),
  insertsubsection: command(
    "insertsubsection",
    "Expands to the current subsection title for use in Beamer templates such as headlines and footlines."
  ),
  inserttotalframenumber: command(
    "inserttotalframenumber",
    "Expands to the total frame count from Beamer's previous compilation pass. Compile again after adding or removing frames."
  ),
  institute: command(
    "institute",
    "Sets affiliation metadata for Beamer's title page. Put it in the preamble; line breaks or `\\and` can separate multiple affiliations."
  ),
  invisible: command(
    "invisible",
    "Makes its argument invisible on the specified overlays while preserving its layout space. Without an overlay specification, it hides the argument on every overlay."
  ),
  logo: command(
    "logo",
    "Sets material Beamer makes available to its navigation and presentation templates, commonly a small logo. Whether and where it appears depends on the active theme."
  ),
  note: command(
    "note",
    "Adds speaker-note material to the current frame. Configure Beamer's notes mode and note-page template to display or print it."
  ),
  only: command(
    "only",
    "Typesets its argument only on the selected overlays and removes it completely from the layout on the others. Use `\\uncover` when hidden content should keep its space."
  ),
  onslide: command(
    "onslide",
    "Applies an overlay specification to following material, changing how it is covered on slides where it is inactive. Use it inside overlay-aware content such as a `frame`.\n\n```latex\n\\onslide<2->{This appears from overlay 2 onward.}\n```"
  ),
  pause: command(
    "pause",
    "Ends the current overlay and makes following material appear on the next one. Use explicit overlay specifications when the reveal order needs to remain clear during editing."
  ),
  setbeamercolor: command(
    "setbeamercolor",
    "Configures a named Beamer colour element, such as `normal text` or `frametitle`, with foreground, background, or parent settings. Put global theme customisation in the preamble.\n\n```latex\n\\setbeamercolor{frametitle}{fg=white,bg=blue}\n```"
  ),
  setbeamerfont: command(
    "setbeamerfont",
    "Configures a named Beamer font element, such as `frametitle`, with settings including family, series, shape, size, or parent. Put global theme customisation in the preamble.\n\n```latex\n\\setbeamerfont{frametitle}{series=\\bfseries}\n```"
  ),
  setbeamersize: command(
    "setbeamersize",
    "Sets Beamer layout dimensions, including `text margin left` and `text margin right`. Use it in the preamble so frame layout remains consistent.\n\n```latex\n\\setbeamersize{text margin left=1cm,text margin right=1cm}\n```"
  ),
  setbeamertemplate: command(
    "setbeamertemplate",
    "Replaces the definition of a named Beamer template such as `navigation symbols`, `footline`, or `itemize items`. Define global template changes in the preamble.\n\n```latex\n\\setbeamertemplate{navigation symbols}{}\n```"
  ),
  structure: command(
    "structure",
    "Applies Beamer's structural emphasis style to its argument. The active colour and font themes control its appearance."
  ),
  subtitle: command(
    "subtitle",
    "Sets subtitle metadata for Beamer's title page. Put it in the preamble; the active theme determines whether and how it is displayed."
  ),
  temporal: command(
    "temporal",
    "Chooses among three arguments before, on, and after the selected overlays.\n\n```latex\n\\temporal<2>{past}{present}{future}\n```"
  ),
  titlegraphic: command(
    "titlegraphic",
    "Sets graphic material for Beamer's title page, such as `\\titlegraphic{\\includegraphics{logo}}`. The active theme determines its placement."
  ),
  uncover: command(
    "uncover",
    "Shows its argument only on the selected overlays while reserving its layout space on the others. Use `\\only` when hidden content should not occupy space."
  ),
  usecolortheme: command(
    "usecolortheme",
    "Loads a Beamer colour theme. Use it in the preamble after selecting the presentation class; optional theme options adjust the chosen theme.\n\n```latex\n\\usecolortheme{dolphin}\n```"
  ),
  usefonttheme: command(
    "usefonttheme",
    "Loads a Beamer font theme in the preamble. It changes theme-controlled typography rather than the document's ordinary text font settings.\n\n```latex\n\\usefonttheme{professionalfonts}\n```"
  ),
  useinnertheme: command(
    "useinnertheme",
    "Loads a Beamer inner theme, which controls elements inside frames such as title pages, item markers, and blocks. Use it in the preamble.\n\n```latex\n\\useinnertheme{rounded}\n```"
  ),
  useoutertheme: command(
    "useoutertheme",
    "Loads a Beamer outer theme, which controls presentation chrome such as headlines, footlines, and sidebars. Use it in the preamble.\n\n```latex\n\\useoutertheme{infolines}\n```"
  ),
  usetheme: command(
    "usetheme",
    "Loads a complete Beamer presentation theme in the preamble. Refine its components later with colour, font, inner, or outer themes.\n\n```latex\n\\usetheme{Madrid}\n```"
  ),
  visible: command(
    "visible",
    "Shows its argument on the selected overlays and makes it invisible while preserving layout space on the others."
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
