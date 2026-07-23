/**
 * The BibTeX entry types and field names TeX suggests.
 *
 * The set covers standard BibTeX plus the biblatex types authors reach for most
 * often. Every type lists the fields its style will look for, so an inserted
 * template is a usable entry rather than a stub the engine will warn about.
 */

export type BibtexEntryType = Readonly<{
  /** Lowercased type name, without its `@`. */
  name: string
  description: string
  /** Fields the entry is not usable without; an inserted template holds exactly these. */
  required: readonly string[]
  optional: readonly string[]
}>

export const BIBTEX_ENTRY_TYPES: readonly BibtexEntryType[] = [
  {
    name: "article",
    description: "An article from a journal or magazine.",
    required: ["author", "title", "journal", "year"],
    optional: ["volume", "number", "pages", "month", "doi", "note"],
  },
  {
    name: "book",
    description: "A book with a named publisher.",
    required: ["author", "title", "publisher", "year"],
    optional: [
      "editor",
      "volume",
      "series",
      "address",
      "edition",
      "month",
      "isbn",
      "note",
    ],
  },
  {
    name: "booklet",
    description: "Printed and bound work without a named publisher.",
    required: ["title"],
    optional: ["author", "howpublished", "address", "month", "year", "note"],
  },
  {
    name: "inbook",
    description: "A part of a book: a chapter, a section, or a page range.",
    required: ["author", "title", "chapter", "publisher", "year"],
    optional: ["editor", "pages", "volume", "series", "address", "edition"],
  },
  {
    name: "incollection",
    description: "A part of a book with its own title and author.",
    required: ["author", "title", "booktitle", "publisher", "year"],
    optional: ["editor", "pages", "series", "address", "chapter", "doi"],
  },
  {
    name: "inproceedings",
    description: "A paper in conference proceedings.",
    required: ["author", "title", "booktitle", "year"],
    optional: [
      "editor",
      "pages",
      "organization",
      "publisher",
      "address",
      "doi",
    ],
  },
  {
    name: "conference",
    description:
      "A paper in conference proceedings; a synonym of inproceedings.",
    required: ["author", "title", "booktitle", "year"],
    optional: ["editor", "pages", "organization", "publisher", "address"],
  },
  {
    name: "manual",
    description: "Technical documentation.",
    required: ["title"],
    optional: [
      "author",
      "organization",
      "address",
      "edition",
      "month",
      "year",
      "note",
    ],
  },
  {
    name: "mastersthesis",
    description: "A master's thesis.",
    required: ["author", "title", "school", "year"],
    optional: ["type", "address", "month", "note"],
  },
  {
    name: "phdthesis",
    description: "A doctoral thesis.",
    required: ["author", "title", "school", "year"],
    optional: ["type", "address", "month", "note"],
  },
  {
    name: "misc",
    description: "Anything the other types do not fit.",
    required: ["author", "title", "year"],
    optional: ["howpublished", "month", "url", "urldate", "note"],
  },
  {
    name: "proceedings",
    description: "Conference proceedings as a whole.",
    required: ["title", "year"],
    optional: [
      "editor",
      "volume",
      "series",
      "publisher",
      "organization",
      "address",
    ],
  },
  {
    name: "techreport",
    description: "A report published by an institution.",
    required: ["author", "title", "institution", "year"],
    optional: ["type", "number", "address", "month", "note"],
  },
  {
    name: "unpublished",
    description: "A finished work that has not been published.",
    required: ["author", "title", "note"],
    optional: ["month", "year"],
  },
  {
    name: "online",
    description: "A web page or other online resource (biblatex).",
    required: ["author", "title", "year", "url"],
    optional: ["urldate", "organization", "note"],
  },
  {
    name: "thesis",
    description: "A thesis of any degree (biblatex).",
    required: ["author", "title", "type", "institution", "year"],
    optional: ["address", "month", "note"],
  },
  {
    name: "report",
    description: "An institutional report (biblatex).",
    required: ["author", "title", "type", "institution", "year"],
    optional: ["number", "address", "month", "doi", "note"],
  },
  {
    name: "software",
    description: "A program or package (biblatex).",
    required: ["author", "title", "year", "url"],
    optional: ["version", "organization", "urldate", "note"],
  },
  {
    name: "dataset",
    description: "A published data set (biblatex).",
    required: ["author", "title", "year", "url"],
    optional: ["publisher", "version", "doi", "urldate", "note"],
  },
  {
    name: "string",
    description: "Defines an abbreviation other entries can reuse.",
    required: [],
    optional: [],
  },
  {
    name: "preamble",
    description: "LaTeX copied verbatim into the bibliography.",
    required: [],
    optional: [],
  },
  {
    name: "comment",
    description: "Text BibTeX ignores.",
    required: [],
    optional: [],
  },
]

/** What each field holds, in the author's terms rather than BibTeX's. */
export const BIBTEX_FIELDS: ReadonlyMap<string, string> = new Map([
  ["abstract", "A summary of the work."],
  ["address", "Where the publisher or institution is located."],
  ["annote", "An annotation, used by annotated bibliography styles."],
  ["author", "Authors, separated by ` and `."],
  ["booktitle", "Title of the book or proceedings the work appears in."],
  ["chapter", "Chapter or section number."],
  ["crossref", "Key of an entry this one inherits fields from."],
  ["doi", "Digital Object Identifier, without the resolver prefix."],
  ["edition", "Edition of the book, such as `Second`."],
  ["editor", "Editors, separated by ` and `."],
  ["eprint", "Preprint identifier, such as an arXiv number."],
  ["eprinttype", "The preprint archive the eprint identifier belongs to."],
  ["howpublished", "How an unusual work was made available."],
  ["institution", "Institution that published a report."],
  ["isbn", "International Standard Book Number."],
  ["issn", "International Standard Serial Number."],
  ["journal", "Name of the journal."],
  ["keywords", "Keywords, for styles and tools that index them."],
  ["langid", "Language of the work, for hyphenation and localised terms."],
  ["month", "Month of publication; use the three-letter abbreviations."],
  ["note", "Anything else a reader should know."],
  ["number", "Issue or report number."],
  ["organization", "Organisation behind a conference or manual."],
  ["pages", "Page range, with `--` between the endpoints."],
  ["publisher", "Name of the publisher."],
  ["school", "Institution that awarded the degree."],
  ["series", "Series the book or proceedings belongs to."],
  ["title", "Title of the work; brace words whose case must be kept."],
  ["type", "What kind of report or thesis this is."],
  ["url", "Address the work can be read at."],
  ["urldate", "Date the address was last checked, as `YYYY-MM-DD`."],
  ["version", "Version of the software or data set."],
  ["volume", "Volume of the journal or multi-volume book."],
  ["year", "Year of publication."],
])
