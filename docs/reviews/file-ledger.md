# Maintained-file review ledger

Ledger revision: 1  
Baseline commit: `eb95280770d2a7b15703f4ebbd3af6ca7e4af767`  
Inventory state: complete; Waves A–H reviewed

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
| C | Rust process, parser, and event boundary | 7 | Reviewed |
| D | Domain and IPC contracts | 16 | Reviewed |
| E | React orchestration | 13 | Reviewed |
| F | Editor, search, project tree, and UI | 28 | Reviewed |
| G | PDF and synchronization UI | 3 | Reviewed |
| H | Styles, components, fixtures, assets, and documentation | 140 | Reviewed |
| **Total** | | **244 ledger rows / 243 maintained** | **Waves A–H reviewed** |

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
| `bun.lock` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `components.json` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `deny.toml` | A | Reviewed | TEX-A-002; cargo-deny 0.20.2 policy |
| `docs/benchmarks/README.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/benchmarks/reference-machines.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/benchmarks/result-template.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/code-quality.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/engineering-standard.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/known-limitations.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/phase-0.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/plans/code-review-plan.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/plans/next-roadmap.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/plans/project-audit.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/plans/project.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/privacy.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/project-build-configuration.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/repository-policy.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/research/target-user-study.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/reviews/baseline.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/reviews/exceptions.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/reviews/file-ledger.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/reviews/findings.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/reviews/oxlint-migration.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/reviews/rule-decisions.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/reviews/source-register.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/reviews/threat-model.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/support.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `docs/ui-ux-requirements.md` | H | Reviewed | Wave H documentation truth, policy, provenance, and support review |
| `eslint.config.js` | A | Removed | TEX-A-005; replaced by Oxlint |
| `index.html` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `package.json` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `README.md` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `rust-toolchain.toml` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `src-tauri/.gitignore` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `src-tauri/build.rs` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `src-tauri/capabilities/default.json` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `src-tauri/Cargo.lock` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `src-tauri/Cargo.toml` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `src-tauri/icons/128x128.png` | H | Reviewed | Packaging icon set; Tauri bundle and platform ownership verified |
| `src-tauri/icons/128x128@2x.png` | H | Reviewed | Packaging icon set; Tauri bundle and platform ownership verified |
| `src-tauri/icons/32x32.png` | H | Reviewed | Packaging icon set; Tauri bundle and platform ownership verified |
| `src-tauri/icons/icon.icns` | H | Reviewed | Packaging icon set; Tauri bundle and platform ownership verified |
| `src-tauri/icons/icon.ico` | H | Reviewed | Packaging icon set; Tauri bundle and platform ownership verified |
| `src-tauri/icons/icon.png` | H | Reviewed | Packaging icon set; Tauri bundle and platform ownership verified |
| `src-tauri/icons/Square107x107Logo.png` | H | Reviewed | Packaging icon set; Tauri bundle and platform ownership verified |
| `src-tauri/icons/Square142x142Logo.png` | H | Reviewed | Packaging icon set; Tauri bundle and platform ownership verified |
| `src-tauri/icons/Square150x150Logo.png` | H | Reviewed | Packaging icon set; Tauri bundle and platform ownership verified |
| `src-tauri/icons/Square284x284Logo.png` | H | Reviewed | Packaging icon set; Tauri bundle and platform ownership verified |
| `src-tauri/icons/Square30x30Logo.png` | H | Reviewed | Packaging icon set; Tauri bundle and platform ownership verified |
| `src-tauri/icons/Square310x310Logo.png` | H | Reviewed | Packaging icon set; Tauri bundle and platform ownership verified |
| `src-tauri/icons/Square44x44Logo.png` | H | Reviewed | Packaging icon set; Tauri bundle and platform ownership verified |
| `src-tauri/icons/Square71x71Logo.png` | H | Reviewed | Packaging icon set; Tauri bundle and platform ownership verified |
| `src-tauri/icons/Square89x89Logo.png` | H | Reviewed | Packaging icon set; Tauri bundle and platform ownership verified |
| `src-tauri/icons/StoreLogo.png` | H | Reviewed | Packaging icon set; Tauri bundle and platform ownership verified |
| `src-tauri/src/build_operations.rs` | C | Reviewed | TEX-C-005, TEX-C-006; bounded clean/reveal operations |
| `src-tauri/src/build_system.rs` | C | Reviewed | TEX-C-002, TEX-C-003, TEX-C-004, TEX-C-008 |
| `src-tauri/src/bounded_io.rs` | B | Reviewed | TEX-B-003; bounded open-handle reads |
| `src-tauri/src/latex_fixtures.rs` | C | Reviewed | TEX-C-005; bounded test process execution |
| `src-tauri/src/lib.rs` | D | Reviewed | Complete command/state/plugin registration |
| `src-tauri/src/main.rs` | D | Reviewed | Minimal platform entry point |
| `src-tauri/src/pdf_read.rs` | B | Reviewed | TEX-B-003; bounded reads and symlink rejection |
| `src-tauri/src/persistence.rs` | B | Reviewed | TEX-B-003; bounded state and collection limits |
| `src-tauri/src/process_support.rs` | C | Reviewed | TEX-C-003, TEX-C-005; process-group deadlines/capture |
| `src-tauri/src/project_access.rs` | B | Reviewed | TEX-B-001; canonical root identity |
| `src-tauri/src/project_config.rs` | B | Reviewed | TEX-C-001; bounded config and normal child paths |
| `src-tauri/src/project_files.rs` | B | Reviewed | TEX-B-002, TEX-B-006, TEX-B-007 |
| `src-tauri/src/project_open.rs` | B | Reviewed | TEX-B-003; bounded tree allocation |
| `src-tauri/src/project_search.rs` | B | Reviewed | TEX-B-003, TEX-B-004 |
| `src-tauri/src/readiness.rs` | C | Reviewed | Static capability contract remains truthful |
| `src-tauri/src/root_detection.rs` | B | Reviewed | TEX-B-003; file/entry/depth/read limits |
| `src-tauri/src/source_edit.rs` | B | Reviewed | TEX-B-003, TEX-B-005; canonical recovery keys |
| `src-tauri/src/source_read.rs` | B | Reviewed | TEX-B-003; strict relative paths and bounded reads |
| `src-tauri/src/synctex.rs` | C | Reviewed | TEX-C-005; bounded process and output validation |
| `src-tauri/src/watch_system.rs` | C | Reviewed | TEX-C-004, TEX-C-007; bounded channels/state ordering |
| `src-tauri/tauri.conf.json` | A | Reviewed | Wave A configuration/workflow/dependency evidence |
| `src/accessibility.test.tsx` | H | Reviewed | TEX-H-001, TEX-H-004; primary workflow role/name/keyboard and axe regressions |
| `src/app/app.tsx` | E | Reviewed | TEX-E-001; detached UI action ownership and route coordination |
| `src/components/brand/app-brand.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/feedback/open-project-feedback.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/feedback/startup-screen.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/ui/alert.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/ui/badge.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/ui/button.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/ui/card.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/ui/command.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/ui/context-menu.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/ui/dialog.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/ui/empty.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/ui/input-group.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/ui/input.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/ui/resizable.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/ui/scroll-area.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/ui/select.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/ui/separator.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/ui/skeleton.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/ui/tabs.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/components/ui/textarea.tsx` | H | Reviewed | TEX-H-004; semantic composition and explicit exported contracts |
| `src/domain/build.test.ts` | D | Reviewed | TEX-D-003; ordering and retention regressions |
| `src/domain/build.ts` | D | Reviewed | TEX-D-002, TEX-D-003; readonly typed state contract |
| `src/domain/identifiers.test.ts` | D | Reviewed | Opaque path/ID constructor regressions |
| `src/domain/identifiers.ts` | D | Reviewed | TEX-D-002; canonical/relative/ID/hash brands |
| `src/domain/latex.test.ts` | D | Reviewed | Parser/reference contract evidence |
| `src/domain/latex.ts` | D | Reviewed | Linear bounded source/reference parser |
| `src/domain/project.ts` | D | Reviewed | Readonly project/workspace/source and IME-aware editor-change contracts |
| `src/features/build/build-configuration-dialog.test.tsx` | H | Reviewed | TEX-H-003; incomplete environment draft regression |
| `src/features/build/build-configuration-dialog.tsx` | H | Reviewed | TEX-H-003, TEX-H-004; stable drafts, serialized save, bounded accessible fields |
| `src/features/build/build-panel.tsx` | H | Reviewed | TEX-H-004; named build controls and explicit component contract |
| `src/features/build/clean-auxiliary-dialog.tsx` | H | Reviewed | TEX-H-006; destructive-operation generation and duplicate exclusion |
| `src/features/build/use-project-build.ts` | E | Reviewed | TEX-E-002, TEX-E-003; operation epochs, duplicate suppression, serialized configuration writes |
| `src/features/build/use-project-watch.ts` | E | Reviewed | TEX-E-002; event precedence, teardown-safe queue acknowledgement, lifecycle generations |
| `src/features/commands/workspace-command-palette.tsx` | F | Reviewed | Deferred source-file derivation while closed; bounded by Rust tree contract |
| `src/features/editor/editor-change.test.ts` | F | Reviewed | TEX-F-001, TEX-F-003; composition and post-write state regressions |
| `src/features/editor/editor-change.ts` | F | Reviewed | TEX-F-001, TEX-F-003; explicit edit/persistence transition classifier |
| `src/features/editor/latex-editor.tsx` | F | Reviewed | TEX-F-003, TEX-F-005; CodeMirror composition, state cache, disposal, focus |
| `src/features/editor/latex-highlighting.test.ts` | F | Reviewed | Stable stream-parser token class evidence |
| `src/features/editor/latex-highlighting.ts` | F | Reviewed | CodeMirror highlight-class mapping |
| `src/features/editor/latex-hover.test.ts` | F | Reviewed | Comment exclusion and project-reference resolution regressions |
| `src/features/editor/latex-hover.ts` | F | Reviewed | TEX-F-005; safe DOM construction and approved project reads |
| `src/features/editor/latex-semantic-highlighting.test.ts` | F | Reviewed | Semantic argument and missing-file regressions |
| `src/features/editor/latex-semantic-highlighting.ts` | F | Reviewed | Viewport-owned decoration lifecycle and readonly context |
| `src/features/pdf/pdf-viewer-model.test.ts` | G | Reviewed | TEX-G-001, TEX-G-003, TEX-G-004; replacement, bounds, outline, rotation, and render-window regressions |
| `src/features/pdf/pdf-viewer-model.ts` | G | Reviewed | TEX-G-001, TEX-G-003, TEX-G-004; last-good state and explicit PDF resource budgets |
| `src/features/pdf/pdf-viewer.tsx` | G | Reviewed | TEX-G-001–TEX-G-005, TEX-H-002; task disposal, bounded rendering/search, context and SyncTeX ownership |
| `src/features/projects/document-outline-panel.tsx` | F | Reviewed | Memoized outline derivation and semantic navigation |
| `src/features/projects/document-outline.test.ts` | F | Reviewed | Section, comment, formatting, and escaped-percent regressions |
| `src/features/projects/document-outline.ts` | F | Reviewed | Bounded line-oriented structural extraction |
| `src/features/projects/document-tabs.test.ts` | F | Reviewed | Preview/pin/close selection regressions |
| `src/features/projects/document-tabs.ts` | F | Reviewed | Immutable document-tab transitions |
| `src/features/projects/project-model.test.ts` | F | Reviewed | Tree, root, PDF, dependency, case, and timestamp regressions |
| `src/features/projects/project-model.ts` | F | Reviewed | Normalized tree/reference derivation and locale-independent extensions |
| `src/features/projects/project-sidebar.tsx` | F | Reviewed | Memoized reference derivation and truthful availability states |
| `src/features/projects/project-tree.tsx` | F | Reviewed | TEX-F-004; inline mutation flow, bounded initial expansion, clipboard ownership |
| `src/features/projects/recent-project-list.tsx` | F | Reviewed | Truthful availability and non-destructive forget action |
| `src/features/projects/root-file-control.tsx` | F | Reviewed | Detected/configured/multiple-root state contract |
| `src/features/projects/source-tabs.tsx` | F | Reviewed | TEX-F-004; preview/pin/close semantics and clipboard feedback |
| `src/features/projects/source-viewer.tsx` | F | Reviewed | TEX-F-001, TEX-F-003; conflict/recovery and editor composition boundary |
| `src/features/projects/use-project-session.ts` | E | Reviewed | TEX-E-002, TEX-E-003, TEX-F-001, TEX-F-003, TEX-F-004; save/mutation state ownership |
| `src/features/projects/use-project-tree-watch.ts` | E | Reviewed | TEX-E-002; startup/teardown ordering and listener error ownership |
| `src/features/projects/workspace-restoration.test.ts` | E | Reviewed | Viewport-clamping and truthful restoration-notice regressions |
| `src/features/projects/workspace-restoration.ts` | E | Reviewed | Bounded geometry restoration preserving available editor space |
| `src/features/projects/workspace-toolbar.tsx` | F | Reviewed | Save/build availability and named keyboard routes |
| `src/features/search/project-search-panel.tsx` | F | Reviewed | TEX-F-002; latest-request mutation exclusion and transactional undo |
| `src/features/settings/use-app-preferences.ts` | E | Reviewed | TEX-E-003; ordered writes, revision-aware load/error handling |
| `src/index.css` | H | Reviewed | TEX-H-004; complete forced-colors, color-scheme, motion, and focus-token review |
| `src/lib/shortcuts.test.ts` | H | Reviewed | Keyboard label and platform mapping tests reviewed |
| `src/lib/shortcuts.ts` | H | Reviewed | Keyboard label and platform mapping tests reviewed |
| `src/lib/promises.ts` | H | Reviewed | TEX-E-001, TEX-H-006; type-aware detached promise ownership |
| `src/lib/latest-request.test.ts` | F | Reviewed | TEX-F-002; latest-only and teardown invalidation regressions |
| `src/lib/latest-request.ts` | F | Reviewed | TEX-F-002; monotonic asynchronous result ownership |
| `src/lib/serial-task-queue.test.ts` | E | Reviewed | TEX-E-003; ordering and post-failure continuation regressions |
| `src/lib/serial-task-queue.ts` | E | Reviewed | TEX-E-003; minimal ordered mutation owner |
| `src/lib/use-clipboard.ts` | F | Reviewed | TEX-F-004; latest-only clipboard rejection ownership |
| `src/lib/utils.ts` | H | Reviewed | Explicit shared utility contract and call-site review |
| `src/main.tsx` | H | Reviewed | Bootstrap ownership and global style boundary reviewed |
| `src/pages/project-home-page.tsx` | E | Reviewed | Truthful project-entry routes and explicit component contract |
| `src/pages/project-workspace-page.tsx` | E | Reviewed | TEX-E-001, TEX-E-002, TEX-F-003; coordinated actions, focus, and project-bound editor changes |
| `src/pages/settings-page.tsx` | E | Reviewed | Controlled preference/workspace settings with explicit component contract |
| `src/services/build-contract.test.ts` | D | Reviewed | TEX-D-001; malformed event and bound tests |
| `src/services/build-contract.ts` | D | Reviewed | TEX-D-001; build/watch/config parsers |
| `src/services/build-service.ts` | D | Reviewed | TEX-D-001, TEX-D-002; unknown-to-parser gateway |
| `src/services/ipc-contract.ts` | D | Reviewed | Shared scalar/record/event rejection primitives |
| `src/services/project-contract.test.ts` | D | Reviewed | TEX-D-001; malformed path/hash/tree/coordinate tests |
| `src/services/project-contract.ts` | D | Reviewed | TEX-D-001; project/source/persistence parsers |
| `src/services/project-service.ts` | D | Reviewed | TEX-D-001, TEX-D-002; named request gateways |
| `tests/fixtures/file-watch-storm/events.json` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/file-watch-storm/main.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/file-watch-storm/output/main.aux` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/file-watch-storm/output/main.pdf` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/file-watch-storm/README.md` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/file-watch-storm/sections/body.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/invalid-pdf/README.md` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/invalid-pdf/truncated.pdf` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/biblatex-biber/main.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/biblatex-biber/references.bib` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/broken-build/main.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/broken-build/sections/failure.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/custom-class/fixture-report.cls` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/custom-class/main.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/invalid-setup/notes/wrong-extension.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/invalid-setup/orphan.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/invalid-setup/root.txt` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-01.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-02.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-03.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-04.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-05.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-06.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-07.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-08.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-09.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-10.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-11.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-12.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-13.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-14.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-15.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-16.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-17.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-18.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-19.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-20.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-21.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-22.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-23.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/chapters/chapter-24.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/large-project/main.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/multiple-roots/paper/main.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/multiple-roots/paper/sections/analysis.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/multiple-roots/presentation/sections/summary.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/multiple-roots/presentation/slides.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/NASA-SOURCES.md` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/nasa-technical-report/main.pdf` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/nasa-technical-report/main.synctex.gz` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/nasa-technical-report/main.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/nasa-technical-report/sections/abstract.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/nasa-technical-report/sections/appendix-calibration.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/nasa-technical-report/sections/conclusions.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/nasa-technical-report/sections/introduction.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/nasa-technical-report/sections/method.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/nasa-technical-report/sections/references.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/nasa-technical-report/sections/report-documentation.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/nasa-technical-report/sections/results.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/nasa-technical-report/sections/symbols.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/nasa-technical-report/styles/nasa-report.sty` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/output-directory/build/.gitkeep` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/output-directory/main.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/README.md` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/simple-article/main.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/latex-projects/unicode-project/Måneanalyse/hoveddokument.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/manifest.json` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/root-detection/chapters/introduction.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
| `tests/fixtures/root-detection/main.tex` | H | Reviewed | TEX-H-005; fixture purpose, path contract, provenance, and generated-artifact review |
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
