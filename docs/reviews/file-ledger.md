# Maintained-file review ledger

Ledger revision: 1  
Baseline commit: `eb95280770d2a7b15703f4ebbd3af6ca7e4af767`  
Inventory state: complete; Waves A–B reviewed

Every maintained file has one primary review wave. `Inventoried` means the
file's existence, broad owner, and review assignment are recorded; it does not
mean its implementation or content has passed review. A row becomes
`Reviewed` only after callers, callees, contracts, tests, generated boundaries,
and relevant standard rules have been examined. Findings are tracked separately
in `findings.md`.

Generated `dist/`, `node_modules/`, `src-tauri/target/`, Tauri schemas, and
local caches are excluded. Their generators, inclusion rules, and representative
outputs are reviewed through manifests, lockfiles, build configuration, and
artifact evidence.

## Wave summary

| Wave | Scope | Files | Status |
| --- | --- | ---: | --- |
| A | Repository boundary | 26 ledger rows | Reviewed; 1 removed |
| B | Rust filesystem and persistence | 11 | Reviewed |
| C | Rust process, parser, and event boundary | 6 | Inventoried |
| D | Domain and IPC contracts | 9 | Inventoried |
| E | React orchestration | 11 | Inventoried |
| F | Editor, search, project tree, and UI | 23 | Inventoried |
| G | PDF and synchronization UI | 3 | Inventoried |
| H | Styles, components, fixtures, assets, and documentation | 149 | Inventoried |
| **Total** | | **238 ledger rows / 237 maintained** | **Waves A–B reviewed** |

## File register

| File | Wave | Status | Finding IDs / evidence |
| --- | :---: | --- | --- |
| `.github/workflows/ci.yml` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `.github/workflows/release.yml` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `.gitignore` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `.prettierignore` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `.prettierrc` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `.oxlintrc.json` | A | Reviewed | TEX-A-005; Oxlint 1.74.0 typed policy |
| `AGENTS.md` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `app-icon.png` | H | Inventoried | — |
| `bun.lock` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `components.json` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `deny.toml` | A | Reviewed | TEX-A-002; cargo-deny 0.20.2 policy |
| `docs/benchmarks/README.md` | H | Inventoried | — |
| `docs/benchmarks/reference-machines.md` | H | Inventoried | — |
| `docs/benchmarks/result-template.md` | H | Inventoried | — |
| `docs/code-quality.md` | H | Inventoried | — |
| `docs/engineering-standard.md` | H | Inventoried | — |
| `docs/known-limitations.md` | H | Inventoried | — |
| `docs/phase-0.md` | H | Inventoried | — |
| `docs/plans/code-review-plan.md` | H | Inventoried | — |
| `docs/plans/next-roadmap.md` | H | Inventoried | — |
| `docs/plans/project-audit.md` | H | Inventoried | — |
| `docs/plans/project.md` | H | Inventoried | — |
| `docs/privacy.md` | H | Inventoried | — |
| `docs/project-build-configuration.md` | H | Inventoried | — |
| `docs/repository-policy.md` | H | Inventoried | — |
| `docs/research/target-user-study.md` | H | Inventoried | — |
| `docs/reviews/baseline.md` | H | Inventoried | — |
| `docs/reviews/exceptions.md` | H | Inventoried | — |
| `docs/reviews/file-ledger.md` | H | Inventoried | — |
| `docs/reviews/findings.md` | H | Inventoried | — |
| `docs/reviews/oxlint-migration.md` | H | Inventoried | — |
| `docs/reviews/rule-decisions.md` | H | Inventoried | — |
| `docs/reviews/source-register.md` | H | Inventoried | — |
| `docs/reviews/threat-model.md` | H | In review | Phase 3 command/process map |
| `docs/support.md` | H | Inventoried | — |
| `docs/ui-ux-requirements.md` | H | Inventoried | — |
| `eslint.config.js` | A | Removed | TEX-A-005; replaced by Oxlint |
| `index.html` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `package.json` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `public/vite.svg` | H | Inventoried | — |
| `README.md` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `rust-toolchain.toml` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `src-tauri/.gitignore` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `src-tauri/build.rs` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `src-tauri/capabilities/default.json` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `src-tauri/Cargo.lock` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `src-tauri/Cargo.toml` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `src-tauri/icons/128x128.png` | H | Inventoried | — |
| `src-tauri/icons/128x128@2x.png` | H | Inventoried | — |
| `src-tauri/icons/32x32.png` | H | Inventoried | — |
| `src-tauri/icons/icon.icns` | H | Inventoried | — |
| `src-tauri/icons/icon.ico` | H | Inventoried | — |
| `src-tauri/icons/icon.png` | H | Inventoried | — |
| `src-tauri/icons/Square107x107Logo.png` | H | Inventoried | — |
| `src-tauri/icons/Square142x142Logo.png` | H | Inventoried | — |
| `src-tauri/icons/Square150x150Logo.png` | H | Inventoried | — |
| `src-tauri/icons/Square284x284Logo.png` | H | Inventoried | — |
| `src-tauri/icons/Square30x30Logo.png` | H | Inventoried | — |
| `src-tauri/icons/Square310x310Logo.png` | H | Inventoried | — |
| `src-tauri/icons/Square44x44Logo.png` | H | Inventoried | — |
| `src-tauri/icons/Square71x71Logo.png` | H | Inventoried | — |
| `src-tauri/icons/Square89x89Logo.png` | H | Inventoried | — |
| `src-tauri/icons/StoreLogo.png` | H | Inventoried | — |
| `src-tauri/src/build_operations.rs` | C | Inventoried | — |
| `src-tauri/src/build_system.rs` | C | Inventoried | — |
| `src-tauri/src/bounded_io.rs` | B | Reviewed | TEX-B-003; bounded open-handle reads |
| `src-tauri/src/latex_fixtures.rs` | C | Inventoried | — |
| `src-tauri/src/lib.rs` | D | Inventoried | — |
| `src-tauri/src/main.rs` | D | Inventoried | — |
| `src-tauri/src/pdf_read.rs` | B | Reviewed | TEX-B-003; bounded reads and symlink rejection |
| `src-tauri/src/persistence.rs` | B | Reviewed | TEX-B-003; bounded state and collection limits |
| `src-tauri/src/project_access.rs` | B | Reviewed | TEX-B-001; canonical root identity |
| `src-tauri/src/project_config.rs` | B | Reviewed | TEX-C-001; bounded config and normal child paths |
| `src-tauri/src/project_files.rs` | B | Reviewed | TEX-B-002, TEX-B-006, TEX-B-007 |
| `src-tauri/src/project_open.rs` | B | Reviewed | TEX-B-003; bounded tree allocation |
| `src-tauri/src/project_search.rs` | B | Reviewed | TEX-B-003, TEX-B-004 |
| `src-tauri/src/readiness.rs` | C | Inventoried | — |
| `src-tauri/src/root_detection.rs` | B | Reviewed | TEX-B-003; file/entry/depth/read limits |
| `src-tauri/src/source_edit.rs` | B | Reviewed | TEX-B-003, TEX-B-005; canonical recovery keys |
| `src-tauri/src/source_read.rs` | B | Reviewed | TEX-B-003; strict relative paths and bounded reads |
| `src-tauri/src/synctex.rs` | C | Inventoried | — |
| `src-tauri/src/watch_system.rs` | C | Inventoried | — |
| `src-tauri/tauri.conf.json` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `src/app/app.tsx` | E | Inventoried | — |
| `src/components/brand/app-brand.tsx` | H | Inventoried | — |
| `src/components/feedback/open-project-feedback.tsx` | H | Inventoried | — |
| `src/components/feedback/startup-screen.tsx` | H | Inventoried | — |
| `src/components/ui/alert.tsx` | H | Inventoried | — |
| `src/components/ui/badge.tsx` | H | Inventoried | — |
| `src/components/ui/button.tsx` | H | Inventoried | — |
| `src/components/ui/card.tsx` | H | Inventoried | — |
| `src/components/ui/command.tsx` | H | Inventoried | — |
| `src/components/ui/context-menu.tsx` | H | Inventoried | — |
| `src/components/ui/dialog.tsx` | H | Inventoried | — |
| `src/components/ui/empty.tsx` | H | Inventoried | — |
| `src/components/ui/input-group.tsx` | H | Inventoried | — |
| `src/components/ui/input.tsx` | H | Inventoried | — |
| `src/components/ui/resizable.tsx` | H | Inventoried | — |
| `src/components/ui/scroll-area.tsx` | H | Inventoried | — |
| `src/components/ui/select.tsx` | H | Inventoried | — |
| `src/components/ui/separator.tsx` | H | Inventoried | — |
| `src/components/ui/skeleton.tsx` | H | Inventoried | — |
| `src/components/ui/tabs.tsx` | H | Inventoried | — |
| `src/components/ui/textarea.tsx` | H | Inventoried | — |
| `src/domain/build.test.ts` | D | Inventoried | — |
| `src/domain/build.ts` | D | Inventoried | — |
| `src/domain/latex.test.ts` | D | Inventoried | — |
| `src/domain/latex.ts` | D | Inventoried | — |
| `src/domain/project.ts` | D | Inventoried | — |
| `src/features/build/build-configuration-dialog.tsx` | H | Inventoried | — |
| `src/features/build/build-panel.tsx` | H | Inventoried | — |
| `src/features/build/clean-auxiliary-dialog.tsx` | H | Inventoried | — |
| `src/features/build/use-project-build.ts` | E | Inventoried | — |
| `src/features/build/use-project-watch.ts` | E | Inventoried | — |
| `src/features/commands/workspace-command-palette.tsx` | F | Inventoried | — |
| `src/features/editor/latex-editor.tsx` | F | Inventoried | — |
| `src/features/editor/latex-highlighting.test.ts` | F | Inventoried | — |
| `src/features/editor/latex-highlighting.ts` | F | Inventoried | — |
| `src/features/editor/latex-hover.test.ts` | F | Inventoried | — |
| `src/features/editor/latex-hover.ts` | F | Inventoried | — |
| `src/features/editor/latex-semantic-highlighting.test.ts` | F | Inventoried | — |
| `src/features/editor/latex-semantic-highlighting.ts` | F | Inventoried | — |
| `src/features/pdf/pdf-viewer-model.test.ts` | G | Inventoried | — |
| `src/features/pdf/pdf-viewer-model.ts` | G | Inventoried | — |
| `src/features/pdf/pdf-viewer.tsx` | G | Inventoried | — |
| `src/features/projects/document-outline-panel.tsx` | F | Inventoried | — |
| `src/features/projects/document-outline.test.ts` | F | Inventoried | — |
| `src/features/projects/document-outline.ts` | F | Inventoried | — |
| `src/features/projects/document-tabs.test.ts` | F | Inventoried | — |
| `src/features/projects/document-tabs.ts` | F | Inventoried | — |
| `src/features/projects/project-model.test.ts` | F | Inventoried | — |
| `src/features/projects/project-model.ts` | F | Inventoried | — |
| `src/features/projects/project-sidebar.tsx` | F | Inventoried | — |
| `src/features/projects/project-tree.tsx` | F | Inventoried | — |
| `src/features/projects/recent-project-list.tsx` | F | Inventoried | — |
| `src/features/projects/root-file-control.tsx` | F | Inventoried | — |
| `src/features/projects/source-tabs.tsx` | F | Inventoried | — |
| `src/features/projects/source-viewer.tsx` | F | Inventoried | — |
| `src/features/projects/use-project-session.ts` | E | Inventoried | — |
| `src/features/projects/use-project-tree-watch.ts` | E | Inventoried | — |
| `src/features/projects/workspace-restoration.test.ts` | E | Inventoried | — |
| `src/features/projects/workspace-restoration.ts` | E | Inventoried | — |
| `src/features/projects/workspace-toolbar.tsx` | F | Inventoried | — |
| `src/features/search/project-search-panel.tsx` | F | Inventoried | — |
| `src/features/settings/use-app-preferences.ts` | E | Inventoried | — |
| `src/index.css` | H | Inventoried | — |
| `src/lib/shortcuts.test.ts` | H | Inventoried | — |
| `src/lib/shortcuts.ts` | H | Inventoried | — |
| `src/lib/promises.ts` | H | In review | Type-aware promise ownership |
| `src/lib/utils.ts` | H | Inventoried | — |
| `src/main.tsx` | H | Inventoried | — |
| `src/pages/project-home-page.tsx` | E | Inventoried | — |
| `src/pages/project-workspace-page.tsx` | E | Inventoried | — |
| `src/pages/settings-page.tsx` | E | Inventoried | — |
| `src/services/build-service.ts` | D | Inventoried | — |
| `src/services/project-service.ts` | D | Inventoried | — |
| `tests/fixtures/file-watch-storm/events.json` | H | Inventoried | — |
| `tests/fixtures/file-watch-storm/main.tex` | H | Inventoried | — |
| `tests/fixtures/file-watch-storm/output/main.aux` | H | Inventoried | — |
| `tests/fixtures/file-watch-storm/output/main.pdf` | H | Inventoried | — |
| `tests/fixtures/file-watch-storm/README.md` | H | Inventoried | — |
| `tests/fixtures/file-watch-storm/sections/body.tex` | H | Inventoried | — |
| `tests/fixtures/invalid-pdf/README.md` | H | Inventoried | — |
| `tests/fixtures/invalid-pdf/truncated.pdf` | H | Inventoried | — |
| `tests/fixtures/latex-projects/biblatex-biber/main.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/biblatex-biber/references.bib` | H | Inventoried | — |
| `tests/fixtures/latex-projects/broken-build/main.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/broken-build/sections/failure.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/custom-class/fixture-report.cls` | H | Inventoried | — |
| `tests/fixtures/latex-projects/custom-class/main.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/invalid-setup/notes/wrong-extension.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/invalid-setup/orphan.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/invalid-setup/root.txt` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-01.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-02.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-03.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-04.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-05.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-06.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-07.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-08.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-09.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-10.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-11.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-12.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-13.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-14.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-15.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-16.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-17.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-18.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-19.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-20.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-21.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-22.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-23.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-24.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/large-project/main.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/multiple-roots/paper/main.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/multiple-roots/paper/sections/analysis.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/multiple-roots/presentation/sections/summary.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/multiple-roots/presentation/slides.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/NASA-SOURCES.md` | H | Inventoried | — |
| `tests/fixtures/latex-projects/nasa-technical-report/main.aux` | H | Inventoried | — |
| `tests/fixtures/latex-projects/nasa-technical-report/main.fdb_latexmk` | H | Inventoried | — |
| `tests/fixtures/latex-projects/nasa-technical-report/main.fls` | H | Inventoried | — |
| `tests/fixtures/latex-projects/nasa-technical-report/main.pdf` | H | Inventoried | — |
| `tests/fixtures/latex-projects/nasa-technical-report/main.synctex.gz` | H | Inventoried | — |
| `tests/fixtures/latex-projects/nasa-technical-report/main.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/nasa-technical-report/main.toc` | H | Inventoried | — |
| `tests/fixtures/latex-projects/nasa-technical-report/sections/abstract.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/nasa-technical-report/sections/appendix-calibration.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/nasa-technical-report/sections/conclusions.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/nasa-technical-report/sections/introduction.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/nasa-technical-report/sections/method.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/nasa-technical-report/sections/references.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/nasa-technical-report/sections/report-documentation.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/nasa-technical-report/sections/results.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/nasa-technical-report/sections/symbols.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/nasa-technical-report/styles/nasa-report.sty` | H | Inventoried | — |
| `tests/fixtures/latex-projects/output-directory/build/.gitkeep` | H | Inventoried | — |
| `tests/fixtures/latex-projects/output-directory/main.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/README.md` | H | Inventoried | — |
| `tests/fixtures/latex-projects/simple-article/main.tex` | H | Inventoried | — |
| `tests/fixtures/latex-projects/unicode-project/Måneanalyse/hoveddokument.tex` | H | Inventoried | — |
| `tests/fixtures/manifest.json` | H | Inventoried | — |
| `tests/fixtures/root-detection/chapters/introduction.tex` | H | Inventoried | — |
| `tests/fixtures/root-detection/main.aux` | H | Inventoried | — |
| `tests/fixtures/root-detection/main.fdb_latexmk` | H | Inventoried | — |
| `tests/fixtures/root-detection/main.fls` | H | Inventoried | — |
| `tests/fixtures/root-detection/main.pdf` | H | Inventoried | — |
| `tests/fixtures/root-detection/main.synctex.gz` | H | Inventoried | — |
| `tests/fixtures/root-detection/main.tex` | H | Inventoried | — |
| `tsconfig.app.json` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `tsconfig.json` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `tsconfig.node.json` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `vite.config.test.ts` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `vite.config.ts` | A | Reviewed | Wave A configuration/workflow/dependency evidence |

## Maintenance rule

Add a row in the same change that adds a maintained file. A review wave may not
close while one of its rows is `Inventoried`, `In review`, or references an
unresolved critical/high finding. Removal requires call-site or ownership
evidence in the finding register and a passing relevant build/test gate.
