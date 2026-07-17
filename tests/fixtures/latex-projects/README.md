# LaTeX project fixtures

These projects are development-only inputs for exercising TeX against both
realistic documents and deliberately hostile or incomplete setups. LaTeX
project fixtures normally commit source inputs only. Builds must create their
outputs in the test workspace; generated logs and auxiliary databases do not
belong in these project directories. The NASA fixture additionally commits one
PDF and matching compressed SyncTeX snapshot. Their exact bytes are immutable
inputs to PDF-read, synchronization, and last-known-good stress tests.

| Fixture | Expected roots | Build expectation | Purpose |
| --- | ---: | --- | --- |
| `simple-article` | 1 | succeeds | Small, ordinary article with an internal reference |
| `nasa-technical-report` | 1 | succeeds | Multi-file technical memorandum with front matter, SI units, acronyms, tables, equations, references, and report metadata |
| `multiple-roots` | 2 | both succeed | Independent paper and presentation roots in one project |
| `broken-build` | 1 | fails | Detectable root whose included source contains an undefined command |
| `invalid-setup` | 0 | not buildable | Commented document class and invalid or escaping magic-root directives |
| `unicode-project` | 1 | succeeds | UTF-8 source and a non-ASCII directory name |
| `biblatex-biber` | 1 | succeeds when `biber` is installed | BibLaTeX bibliography tool discovery and multi-pass builds |
| `custom-class` | 1 | succeeds | Project-local document class and custom macro loading |
| `large-project` | 1 | succeeds | Synthetic 24-chapter indexing, search, build, and timing input |
| `output-directory` | 1 | succeeds | Project-local generated-output directory metadata |

Non-project fixtures are described by `../manifest.json`. The deliberately
truncated PDF is an immutable parser input. The file-watch storm commits a
synthetic source, event sequence, and output snapshot because transitions
between those exact files define the test. These are fixture payloads, not
incidental build products. The manifest is the machine-readable source of
expected roots, outcomes, command requirements, search terms, and output paths.
Rust tests validate that every referenced path exists before conditionally
compiling buildable projects.

The NASA-style fixture is fictional and is not an official NASA publication or
template. Its organization follows public NASA scientific and technical
information guidance: clearly identified report front matter, logical technical
sections, SI measurements, defined acronyms, references, an appendix, and a
report-documentation page. It intentionally uses a small local style package so
tests do not depend on proprietary fonts, logos, or unpublished assets.

All fixtures are synthetic or explicitly documented redistributable material.
Never replace them with a participant's or user's project content.
