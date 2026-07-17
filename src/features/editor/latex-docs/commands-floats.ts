import {
  entry,
  type LatexDocumentation,
} from "@/features/editor/latex-docs/entry"

const command = (name: string, markdown: string): LatexDocumentation =>
  entry(`\\${name}`, markdown)

export const commandsFloats = {
  addlinespace: command(
    "addlinespace",
    "Adds vertical space after a table row without creating a rule. It is supplied by the `booktabs` package."
  ),
  addvspace: command(
    "addvspace",
    "Adds vertical space while avoiding an excessive gap if adjacent material already added space. It is useful in float-related layout code but is a core LaTeX command."
  ),
  arrayrulecolor: command(
    "arrayrulecolor",
    "Sets the colour used for subsequent table rules. It requires `xcolor` with the `table` option, which loads `colortbl`."
  ),
  arraystretch: command(
    "arraystretch",
    "Controls the row-height multiplier for `array` and `tabular` material. Redefine this core LaTeX command locally, for example `\\renewcommand{\\arraystretch}{1.2}`."
  ),
  bottomrule: command(
    "bottomrule",
    "Draws the bottom rule of a formal table. It is supplied by the `booktabs` package; do not combine it with vertical rules."
  ),
  caption: command(
    "caption",
    "Creates a numbered caption and a list entry for a float or caption-capable environment. `\\caption[short list text]{full caption text}` uses the optional text in a list of figures or tables.\n\n```latex\n\\caption{Measured response at each temperature.}\n\\label{fig:response}\n```\n\nPut `\\label` after the caption so it records the figure or table number. It is a core LaTeX command; the `caption` package extends its formatting options."
  ),
  captionof: command(
    "captionof",
    "Creates a caption outside a float environment. It is supplied by the `caption` package (and is also available from the smaller `capt-of` package)."
  ),
  captionsetup: command(
    "captionsetup",
    "Configures caption formatting for figures, tables, and other floats. It is supplied by the `caption` package.\n\n```latex\n\\usepackage{caption}\n\\captionsetup{font=small,labelfont=bf}\n```"
  ),
  cellcolor: command(
    "cellcolor",
    "Sets the background colour of one table cell. It requires `xcolor` with the `table` option, which loads `colortbl`."
  ),
  cline: command(
    "cline",
    "Draws a horizontal rule spanning a specified range of columns in `tabular` or `array`. It is a core LaTeX command."
  ),
  cmidrule: command(
    "cmidrule",
    "Draws a partial horizontal rule with `booktabs` spacing and optional trimmed ends. It is supplied by the `booktabs` package."
  ),
  columncolor: command(
    "columncolor",
    "Sets a background colour for a column definition, normally inside a `>{...}` column preamble. It requires `xcolor` with the `table` option, which loads `colortbl`."
  ),
  ContinuedFloat: command(
    "ContinuedFloat",
    "Marks the current float as a continuation of the preceding float of the same type. It is supplied by the `caption` package and is used inside the float before its caption."
  ),
  DeclareCaptionFont: command(
    "DeclareCaptionFont",
    "Defines a named font option for captions. It is supplied by the `caption` package and belongs in the preamble."
  ),
  DeclareCaptionFormat: command(
    "DeclareCaptionFormat",
    "Defines a named caption layout format for use with `\\captionsetup`. It is supplied by the `caption` package and belongs in the preamble."
  ),
  DeclareCaptionLabelFormat: command(
    "DeclareCaptionLabelFormat",
    "Defines how a caption label is printed. It is supplied by the `caption` package and belongs in the preamble."
  ),
  DeclareCaptionSubType: command(
    "DeclareCaptionSubType",
    "Declares a sub-caption type for a custom float type. It is supplied by the `caption` package and belongs in the preamble."
  ),
  doublerulesepcolor: command(
    "doublerulesepcolor",
    "Sets the colour of the gap between double table rules. It requires `xcolor` with the `table` option, which loads `colortbl`."
  ),
  extracolsep: command(
    "extracolsep",
    "Adjusts additional intercolumn space in an `array` or `tabular` preamble, commonly through `@{\\extracolsep{\\fill}}`. It is a core LaTeX command."
  ),
  floatname: command(
    "floatname",
    "Sets the printed name for a float type, such as changing `Algorithm` to a localised label. It is supplied by the `float` package."
  ),
  floatstyle: command(
    "floatstyle",
    "Selects the style that the next `\\newfloat` declaration will use. It is supplied by the `float` package and belongs in the preamble."
  ),
  graphicspath: command(
    "graphicspath",
    "Declares directories searched for image files by `\\includegraphics`. It is supplied by the `graphicx` package.\n\n```latex\n\\graphicspath{{figures/}{assets/}}\n```"
  ),
  hline: command(
    "hline",
    "Draws a full-width horizontal rule in an `array` or `tabular`. It is a core LaTeX command; use `booktabs` rules for publication-style tables."
  ),
  includegraphics: command(
    "includegraphics",
    "Places an image asset. It is supplied by the `graphicx` package. Its required argument is the file name; common key-value options include `width`, `height`, `scale`, `angle`, and `keepaspectratio`.\n\n```latex\n\\includegraphics[width=0.8\\linewidth]{figures/result.pdf}\n```\n\nSet one dimension, or use `keepaspectratio` when setting both, to avoid distortion. Keep paths relative to the source file. [graphicx on CTAN](https://ctan.org/pkg/graphicx)"
  ),
  listof: command(
    "listof",
    "Prints the list for a custom float type created with `\\newfloat`. It is supplied by the `float` package; its arguments are the float type and list title."
  ),
  midrule: command(
    "midrule",
    "Draws a rule separating the table heading from its body or table sections. It is supplied by the `booktabs` package."
  ),
  multicolumn: command(
    "multicolumn",
    "Makes one table cell span multiple columns and supplies a replacement column specification. It is a core LaTeX command."
  ),
  multirow: command(
    "multirow",
    "Makes one table cell span multiple rows. It is supplied by the `multirow` package."
  ),
  newcolumntype: command(
    "newcolumntype",
    "Defines a reusable column type for `array` and `tabular` preambles. It is supplied by the `array` package."
  ),
  newfloat: command(
    "newfloat",
    "Defines a new float type with a placement default and list-file extension. It is supplied by the `float` package and belongs in the preamble."
  ),
  phantomcaption: command(
    "phantomcaption",
    "Advances the relevant caption counter and creates an anchor without visible caption text. It is supplied by the `caption` package."
  ),
  reflectbox: command(
    "reflectbox",
    "Reflects its contents horizontally. It is supplied by the `graphicx` package."
  ),
  resizebox: command(
    "resizebox",
    "Scales material to an explicit width and height; use `!` for one dimension to preserve aspect ratio. It is supplied by the `graphicx` package."
  ),
  restylefloat: command(
    "restylefloat",
    "Applies the currently selected float style to an existing float type. It is supplied by the `float` package and normally belongs in the preamble."
  ),
  rotatebox: command(
    "rotatebox",
    "Rotates its contents by an angle in degrees. It is supplied by the `graphicx` package."
  ),
  rowcolor: command(
    "rowcolor",
    "Sets the background colour for the current table row. It requires `xcolor` with the `table` option, which loads `colortbl`."
  ),
  scalebox: command(
    "scalebox",
    "Scales material by a horizontal factor and, optionally, a distinct vertical factor. It is supplied by the `graphicx` package."
  ),
  specialrule: command(
    "specialrule",
    "Draws a `booktabs` rule with explicit thickness and surrounding vertical space. It is supplied by the `booktabs` package."
  ),
  subcaption: command(
    "subcaption",
    "Creates a caption for a sub-figure or sub-table inside a sub-caption environment. It is supplied by the `subcaption` package."
  ),
  subcaptionbox: command(
    "subcaptionbox",
    "Creates a boxed sub-captioned object without writing a sub-caption environment explicitly. It is supplied by the `subcaption` package."
  ),
  subfloat: command(
    "subfloat",
    "Creates a sub-float with an optional sub-caption. It is supplied by the `subcaption` package; do not load the alternative `subfig` package alongside it."
  ),
  subref: command(
    "subref",
    "References a sub-caption label using the sub-caption reference format. It is supplied by the `subcaption` package."
  ),
  tabularnewline: command(
    "tabularnewline",
    "Ends a table row and accepts an optional vertical-space argument. It is supplied by the `array` package and is useful where `\\\\` would be ambiguous."
  ),
  toprule: command(
    "toprule",
    "Draws the top rule of a formal table. It is supplied by the `booktabs` package; do not combine it with vertical rules."
  ),
  vline: command(
    "vline",
    "Draws a vertical rule in an `array` or `tabular`. It is a core LaTeX command, though `booktabs` advises against vertical rules in formal tables."
  ),
} as const satisfies Readonly<Record<string, LatexDocumentation>>
