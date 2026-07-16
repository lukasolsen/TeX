# Project build configuration

TeX stores project build settings in its local application-data directory, not
inside the opened LaTeX project. This avoids modifying a repository merely by
opening it and keeps machine-specific executable paths out of shared source.
Each record is keyed by the canonical project path and uses schema version 1.

Open **Build details**, then choose **Configure project build** to edit:

- the project-relative root file and an existing project-local output directory;
- the intended bibliography tool;
- existing generated directories excluded from watch-triggered builds;
- the restricted TeX environment variables `TEXINPUTS`, `BIBINPUTS`,
  `BSTINPUTS`, `TEXMFHOME`, and `TEXMFOUTPUT`;
- an optional custom command represented as one absolute executable path plus a
  list of separate arguments.

The standard engine profiles remain the recommended route. `latexmk` performs
its normal bibliography-tool discovery; the explicit bibliography value also
records the project's intended tool for a reviewed custom workflow. TeX never
turns a custom command into a shell string and does not expand variables,
redirections, pipes, or command substitutions.

## Validation and consent

Root, output, and generated paths must already exist after canonicalization and
must remain inside the canonical project root. Custom executables must be
absolute existing files. Argument count and length are bounded, NUL values are
rejected, and only the environment names listed above are accepted.

Saving a custom command requires explicit consent to the exact executable and
argument preview. Editing either clears that consent in the interface. An
argument enabling `--shell-escape` or `-shell-escape` requires a second consent
because LaTeX source may then run project-requested programs. Watch mode reads
the same persisted consent record; an invalid or unconsented configuration is
not run.

Standard executables selected from `PATH` are resolved to canonical absolute
paths before launch. Their first version-output line is captured with the build
run after the user starts it, so the retained invocation can be reproduced
without executing a tool merely to populate the settings screen.
