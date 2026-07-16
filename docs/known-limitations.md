# Known limitations

- Build history is intentionally retained only for the current application
  process. Raw compiler logs can contain document fragments and sensitive paths;
  TeX does not persist them across restart without a future explicit retention
  and redaction design.
- PDF text selection is restored after replacement only when the selected text
  remains within a matching PDF.js text-layer span. TeX defers automatic swaps
  while a selection is active so the user can finish or copy it first.

Revision: 2026-07-16

TeX is pre-release software. Keep independent version control or backups for
important projects.

- Windows and macOS release qualification is not complete. The repository can
  produce platform bundles, but accessibility, permission-failure, and real
  end-user smoke-test evidence is still required before a supported release.
- TeX uses commands already available on `PATH`. It does not install a TeX
  distribution, packages, fonts, `latexmk`, `biber`, or SyncTeX, and it cannot
  guarantee that every document or package combination builds.
- BibLaTeX/biber has a dedicated fixture but is not yet qualified on a recorded
  machine. Custom build commands, project-specific output directories, and
  `--shell-escape` consent are not implemented.
- File watching and automatic build mode are not implemented. External source
  and PDF awareness currently uses bounded polling.
- Workspace restoration does not yet include every panel's open state, size,
  selection, and focus.
- PDF replacement preserves the last readable document and common view state,
  but active text selection and interaction-aware deferred replacement are not
  complete. Rapid replacement stress qualification is pending.
- File deletion is permanent and has no trash or undo path. TeX asks for
  confirmation, but users should use version control or external backups.
- Build history is retained only for the current application process.
- Diagnostic parsing is conservative and can miss or weakly map unusual TeX
  output. Raw logs remain the authoritative evidence.
- No formal screen-reader, IME, high-contrast, scaling, or large-project
  qualification matrix has been completed on every target platform.

The tracked implementation order and release gates are in
[`plans/next-roadmap.md`](plans/next-roadmap.md).
