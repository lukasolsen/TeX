/**
 * What TeX can do with a project file, decided from its name alone.
 *
 * The presentation layer uses this to decide whether an entry can be opened at
 * all and which surface opens it. The same classification exists in
 * `src-tauri/src/source_read.rs` and `src-tauri/src/asset_read.rs`, which is
 * where it is enforced: this module only keeps the UI from offering an action
 * the backend would refuse.
 */
export type ProjectFileKind =
  /** LaTeX source: opens in the editor with LaTeX assistance. */
  | "latexSource"
  /** Plain text: opens in the editor without LaTeX assistance. */
  | "text"
  /** A raster or vector image: opens in the image viewer. */
  | "image"
  /** Opens in the PDF viewer. */
  | "pdf"
  /** TeX has no truthful way to display it. */
  | "unsupported"

/**
 * The files LaTeX assistance — completion, diagnostics, hover — applies to.
 * Kept as the narrow original set so broadening what can be *opened* never
 * broadens what TeX claims to analyse.
 */
const latexSourceExtensions = new Set(["bib", "cls", "md", "sty", "tex", "txt"])

/**
 * Other text files that turn up in a LaTeX project and are worth reading in
 * place: engine logs and auxiliary output, class and package internals,
 * bibliography styles, tool configuration, and small data sources.
 */
const textExtensions = new Set([
  "aux",
  "bat",
  "bbl",
  "bbx",
  "blg",
  "bst",
  "cbx",
  "cfg",
  "clo",
  "csv",
  "def",
  "dtx",
  "fd",
  "fls",
  "glg",
  "glo",
  "gls",
  "gnuplot",
  "idx",
  "ilg",
  "ind",
  "ini",
  "ins",
  "json",
  "lbx",
  "ldf",
  "lof",
  "log",
  "lot",
  "ltx",
  "mk",
  "nav",
  "out",
  "pgf",
  "plt",
  "py",
  "rnw",
  "sh",
  "snm",
  "tikz",
  "toc",
  "toml",
  "tsv",
  "vrb",
  "xml",
  "yaml",
  "yml",
])

/** Whole names, for the extensionless files a LaTeX project usually carries. */
const textFileNames = new Set([
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  ".latexmkrc",
  "latexmkrc",
  "license",
  "makefile",
  "readme",
])

/** Only formats a WebView can render in an `img` element are listed. */
const imageMediaTypes = new Map([
  ["avif", "image/avif"],
  ["bmp", "image/bmp"],
  ["gif", "image/gif"],
  ["ico", "image/x-icon"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["svg", "image/svg+xml"],
  ["webp", "image/webp"],
])

function fileName(path: string): string {
  return (path.split("/").pop() ?? path).toLowerCase()
}

function extension(path: string): string | null {
  const name = fileName(path)
  const separator = name.lastIndexOf(".")
  // A leading dot names the file rather than starting an extension, so
  // `.gitignore` is matched by name and not read as a `gitignore` extension.
  if (separator <= 0) return null
  return name.slice(separator + 1)
}

export function projectFileKind(path: string): ProjectFileKind {
  const suffix = extension(path)
  if (suffix === null) {
    return textFileNames.has(fileName(path)) ? "text" : "unsupported"
  }
  if (suffix === "pdf") return "pdf"
  if (imageMediaTypes.has(suffix)) return "image"
  if (latexSourceExtensions.has(suffix)) return "latexSource"
  if (textExtensions.has(suffix) || textFileNames.has(fileName(path))) {
    return "text"
  }
  return "unsupported"
}

/** True for the files TeX offers LaTeX completion, diagnostics, and hover on. */
export function isLatexSource(path: string): boolean {
  return projectFileKind(path) === "latexSource"
}

/** True for every file the editor can open, LaTeX source or not. */
export function isTextFile(path: string): boolean {
  const kind = projectFileKind(path)
  return kind === "latexSource" || kind === "text"
}

export function isImageFile(path: string): boolean {
  return projectFileKind(path) === "image"
}

export function isPdfFile(path: string): boolean {
  return projectFileKind(path) === "pdf"
}

/** True when some TeX surface can display the file. */
export function isOpenableFile(path: string): boolean {
  return projectFileKind(path) !== "unsupported"
}

/** The media type an image's bytes are handed to the WebView with. */
export function imageMediaType(path: string): string | null {
  const suffix = extension(path)
  return suffix === null ? null : (imageMediaTypes.get(suffix) ?? null)
}
