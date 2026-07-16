# LaTeX project fixtures

These projects are development-only inputs for exercising TeX against both
realistic documents and deliberately hostile or incomplete setups. Source files
are committed; generated PDFs, logs, and auxiliary files are not.

| Fixture | Expected roots | Build expectation | Purpose |
| --- | ---: | --- | --- |
| `simple-article` | 1 | succeeds | Small, ordinary article with an internal reference |
| `nasa-technical-report` | 1 | succeeds | Multi-file technical memorandum with front matter, SI units, acronyms, tables, equations, references, and report metadata |
| `multiple-roots` | 2 | both succeed | Independent paper and presentation roots in one project |
| `broken-build` | 1 | fails | Detectable root whose included source contains an undefined command |
| `invalid-setup` | 0 | not buildable | Commented document class and invalid or escaping magic-root directives |
| `unicode-project` | 1 | succeeds | UTF-8 source and a non-ASCII directory name |

The NASA-style fixture is fictional and is not an official NASA publication or
template. Its organization follows public NASA scientific and technical
information guidance: clearly identified report front matter, logical technical
sections, SI measurements, defined acronyms, references, an appendix, and a
report-documentation page. It intentionally uses a small local style package so
tests do not depend on proprietary fonts, logos, or unpublished assets.

