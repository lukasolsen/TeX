# Project-Aware LaTeX Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TeX completion context-aware and project-aware, beginning with reliable command, environment, and structured-snippet completion.

**Architecture:** Rust owns LaTeX capability data, source-context analysis, and completion ranking behind a typed Tauri command. The React/CodeMirror editor supplies the current unsaved document and cursor, renders only valid asynchronous results, and applies backend-provided edits through CodeMirror snippets. The first phase is useful on its own; later phases add project symbols to the same contract rather than a second completion system.

**Tech Stack:** Rust, Tauri 2, Serde, TypeScript strict mode, React 19, CodeMirror 6, Vitest.

## Global Constraints

- All project paths must be resolved through `ProjectAccess`; no completion operation reads outside the approved project root.
- Completion remains local-first: no network, telemetry, external TeX command execution, or content persistence.
- Automatic completion appears only in an explicit LaTeX context, never ordinary prose.
- Preserve editor selection, scroll, active file, PDF state, and focus when requests succeed, fail, or become stale.
- Package-provided completion is offered only after an explicit matching `\\usepackage` declaration; unknown packages do not imply supported commands.
- Rust commands remain thin and return typed serializable data with stable, user-safe errors.
- Use TDD for every behavior change and run the checks in `AGENTS.md` before handoff.

---

## Delivery phases

1. **Immediate value — intelligent commands, environments, and snippets:** one query command, context parser, capability catalog, deterministic ranking, and a redesigned CodeMirror list. This is the implementation target for the current work.
2. **Project symbols:** add labels, citations, and file paths to the same indexed query response after the phase-one contract has proven stable.
3. **Incremental project index:** cache validated project analysis and update it from saved-file changes plus active-buffer revisions; retain the phase-one request path as a correct fallback.
4. **Capability breadth and polish:** broaden package/class metadata from tested fixtures, refine provenance/detail presentation, and add accessibility/performance regression coverage.

## File structure

- `src-tauri/src/latex_completion.rs` — Phase-one types, syntax scanning, capability catalog, context detection, ranking, and the Tauri command.
- `src-tauri/src/lib.rs` — registers the command only.
- `src/domain/latex-completion.ts` — frontend discriminated-union contract validation; has no filesystem or IPC access.
- `src/domain/latex-completion.test.ts` — contract parser tests for valid and malformed backend data.
- `src/services/project-service.ts` — typed IPC wrapper for a completion query.
- `src/features/editor/latex-completion.ts` — CodeMirror completion source and backend-to-CodeMirror adaptation.
- `src/features/editor/latex-completion.test.ts` — context/source behavior and stale-query tests.
- `src/features/editor/latex-editor.tsx` — replaces the three static snippets with the contextual source and popup styling.

## Phase 1: immediate command, environment, and snippet intelligence

### Task 1: Define and test the Rust completion model and command context

**Files:**
- Create: `src-tauri/src/latex_completion.rs`
- Modify: `src-tauri/src/lib.rs`

**Consumes:** `ProjectAccess::resolve` and the active document text supplied by the editor.

**Produces:** `latex_completions(request, access) -> Result<CompletionResponse, CompletionError>` with `CompletionKind`, `CompletionItem`, and `CompletionContext`.

- [ ] **Step 1: Write failing Rust tests for command and environment contexts**

```rust
#[test]
fn detects_a_command_prefix_after_an_unescaped_backslash() {
    assert_eq!(completion_context("Text \\sec", 9), CompletionContext::Command { prefix: "sec".into(), from: 5 });
}

#[test]
fn detects_begin_and_end_environment_prefixes() {
    assert_eq!(completion_context("\\begin{fig", 10), CompletionContext::BeginEnvironment { prefix: "fig".into(), from: 7 });
    assert_eq!(completion_context("\\end{ite", 8), CompletionContext::EndEnvironment { prefix: "ite".into(), from: 5 });
}

#[test]
fn suppresses_completion_in_plain_text_and_comments() {
    assert_eq!(completion_context("ordinary words", 13), CompletionContext::None);
    assert_eq!(completion_context("% \\sec", 6), CompletionContext::None);
}
```

- [ ] **Step 2: Run the new tests and verify they fail because the module does not exist**

Run: `cargo test --manifest-path src-tauri/Cargo.toml latex_completion`

Expected: compilation failure referring to the missing `latex_completion` module.

- [ ] **Step 3: Implement the minimal context scanner and typed request/response**

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompletionRequest {
    project_path: String,
    relative_path: String,
    content: String,
    position: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum CompletionContext {
    None,
    Command { from: usize, prefix: String },
    BeginEnvironment { from: usize, prefix: String },
    EndEnvironment { from: usize, prefix: String },
}
```

Validate `relative_path` with the existing readable-source rules, reject positions that are not UTF-8 character boundaries or that exceed `content.len()`, and scan only the current line back to the preceding unescaped `%` or LaTeX delimiter.

- [ ] **Step 4: Register the Tauri command and verify the Rust tests pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml latex_completion`

Expected: all `latex_completion` tests pass.

- [ ] **Step 5: Commit the independently tested context model**

```bash
git add src-tauri/src/latex_completion.rs src-tauri/src/lib.rs
git commit -m "feat: add LaTeX completion context command"
```

### Task 2: Add truthful capabilities, local declarations, and ranking

**Files:**
- Modify: `src-tauri/src/latex_completion.rs`

**Consumes:** `CompletionContext` from Task 1 and active document text.

**Produces:** ranked command/environment/snippet `CompletionItem` values with a replacement range, provenance, detail, and optional snippet insertion.

- [ ] **Step 1: Write failing Rust tests for package and local inference**

```rust
#[test]
fn ranks_a_local_macro_before_a_core_command() {
    let source = "\\newcommand{\\summary}[1]{#1}\n\\sum";
    assert_eq!(query(source, source.len()).items[0].label, "\\summary");
}

#[test]
fn offers_align_only_when_amsmath_is_declared() {
    assert!(environment_labels("\\begin{ali", 10).is_empty());
    assert_eq!(environment_labels("\\usepackage{amsmath}\n\\begin{ali", 28), vec!["align"]);
}

#[test]
fn proposes_the_nearest_open_environment_when_ending() {
    let source = "\\begin{figure}\n  \\end{fi";
    assert_eq!(query(source, source.len()).items[0].label, "figure");
}
```

- [ ] **Step 2: Run the tests and verify the expected assertion failures**

Run: `cargo test --manifest-path src-tauri/Cargo.toml latex_completion`

Expected: tests fail because no capability/query implementation exists yet.

- [ ] **Step 3: Implement minimal curated capabilities and declaration extraction**

Implement immutable core entries for document structure, lists, figures/tables, and equation environments; package entries for `amsmath`, `amsthm`, `graphicx`, `booktabs`, and `beamer`; and local extraction for `newcommand`, `renewcommand`, `providecommand`, `DeclareMathOperator`, `newenvironment`, and `renewenvironment`. Each capability declares a real prerequisite and a concise detail string. Do not infer commands from unknown packages.

Use this ordering key: matching local definition, matching currently-open environment for an end tag, declared package/class capability, core capability, exact-prefix score, then label. Deduplicate by `(kind, label)`.

- [ ] **Step 4: Add structured snippets and verify all completion tests pass**

Represent `itemize`, `enumerate`, `description`, `figure`, `table`, `equation`, `align`, `theorem`, and `frame` as `CompletionKind::Snippet` entries with snippet text and only expose package-dependent snippets when their prerequisites are declared.

Run: `cargo test --manifest-path src-tauri/Cargo.toml latex_completion`

Expected: all completion tests pass, including environment and local-macro precedence.

- [ ] **Step 5: Commit capability inference**

```bash
git add src-tauri/src/latex_completion.rs
git commit -m "feat: infer LaTeX completion capabilities"
```

### Task 3: Validate the IPC contract in TypeScript

**Files:**
- Create: `src/domain/latex-completion.ts`
- Create: `src/domain/latex-completion.test.ts`
- Modify: `src/services/project-service.ts`

**Consumes:** camel-cased `CompletionResponse` from Task 2.

**Produces:** `requestLatexCompletions(request): Promise<LatexCompletionResponse>` and strict parsers.

- [ ] **Step 1: Write failing Vitest tests for the contract parser**

```ts
it("parses a command completion with a snippet insertion", () => {
  expect(parseLatexCompletionResponse({ items: [{ label: "\\section", detail: "Section heading", kind: "command", provenance: "core", from: 1, to: 5, insertText: "\\section{${title}}" }] })).toMatchObject({ items: [{ kind: "command", provenance: "core" }] })
})

it("rejects a completion with an unknown provenance", () => {
  expect(() => parseLatexCompletionResponse({ items: [{ label: "x", detail: "x", kind: "command", provenance: "invented", from: 0, to: 1, insertText: "x" }] })).toThrow()
})
```

- [ ] **Step 2: Run the test and verify it fails because the parser is missing**

Run: `bun run test src/domain/latex-completion.test.ts`

Expected: failure resolving `@/domain/latex-completion`.

- [ ] **Step 3: Implement exhaustive unknown-value parsers and the IPC wrapper**

Define readonly `LatexCompletionRequest`, `LatexCompletionItem`, and `LatexCompletionResponse` types. Narrow `unknown` fields explicitly; accept only finite non-negative replacement offsets and the exact kind/provenance string unions. Add `requestLatexCompletions` to `project-service.ts` using `invoke("latex_completions", request)` and the parser.

- [ ] **Step 4: Run the contract test and typecheck**

Run: `bun run test src/domain/latex-completion.test.ts && bun run typecheck`

Expected: parser tests and TypeScript typecheck pass.

- [ ] **Step 5: Commit the frontend contract**

```bash
git add src/domain/latex-completion.ts src/domain/latex-completion.test.ts src/services/project-service.ts
git commit -m "feat: add typed LaTeX completion IPC client"
```

### Task 4: Connect CodeMirror and redesign the completion popup

**Files:**
- Create: `src/features/editor/latex-completion.ts`
- Create: `src/features/editor/latex-completion.test.ts`
- Modify: `src/features/editor/latex-editor.tsx`

**Consumes:** `requestLatexCompletions` and the typed completion response from Task 3.

**Produces:** a CodeMirror `CompletionSource` that shows only valid contextual suggestions and maps backend snippets to `@codemirror/autocomplete` snippets.

- [ ] **Step 1: Write failing source tests**

```ts
it("does not request completions while writing prose", async () => {
  await expect(completionsFor("A normal sentence", 17)).resolves.toBeNull()
})

it("maps a backend snippet to a CodeMirror completion", async () => {
  const result = await completionsFor("\\beg", 4)
  expect(result?.options[0]).toMatchObject({ label: "\\begin", type: "keyword" })
})
```

- [ ] **Step 2: Run the test and verify it fails because the source is missing**

Run: `bun run test src/features/editor/latex-completion.test.ts`

Expected: failure resolving `@/features/editor/latex-completion`.

- [ ] **Step 3: Implement revision-safe CodeMirror adaptation**

Use a `CompletionSource` that checks valid local trigger context before IPC, passes active project/path/content/position, returns `null` for no results, and checks `CompletionContext.aborted` before returning. Map backend insert text through `snippet()` only when it contains placeholders; otherwise use the plain insertion text. Supply stable `boost` values from backend order, a source badge in `detail`, and a non-empty `info` DOM node containing the concise detail and provenance.

- [ ] **Step 4: Replace the static source and style the truthful popup**

Remove `latexSnippets` from `latex-editor.tsx`. Configure `autocompletion({ override: [latexCompletionSource(...)], activateOnTyping: true, maxRenderedOptions: 12 })`. Add restrained theme selectors for completion rows, kind icons, selected row, source badge, and the fixed-width information area. Ensure high contrast and `:focus-visible` treatment; do not add a fake loading option or a prose-triggered empty popup.

- [ ] **Step 5: Run focused frontend tests**

Run: `bun run test src/features/editor/latex-completion.test.ts src/features/editor/editor-change.test.ts && bun run typecheck`

Expected: all focused tests and typecheck pass.

- [ ] **Step 6: Commit the usable first phase**

```bash
git add src/features/editor/latex-completion.ts src/features/editor/latex-completion.test.ts src/features/editor/latex-editor.tsx
git commit -m "feat: add contextual LaTeX editor completion"
```

### Task 5: Verify Phase 1 and prepare the next increment

**Files:**
- Modify only files required by failed checks.

**Consumes:** Phase-one implementation.

**Produces:** verified, reviewable initial delivery and an unchanged roadmap for project-symbol indexing.

- [ ] **Step 1: Run formatting and all required verification**

Run:

```bash
bun run lint
bun run typecheck
bun run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: every command exits successfully with no warnings.

- [ ] **Step 2: Inspect the final diff for scope and safety**

Run: `git diff --check master...HEAD && git diff --stat master...HEAD && git status --short`

Expected: no whitespace errors, no generated files, no lockfile edits, and only completion-related source/tests/plan changes.

- [ ] **Step 3: Commit any verification-only corrections deliberately**

If verification requires source corrections, stage each corrected completion file by its explicit path and commit with `git commit -m "fix: harden LaTeX completion"`. Otherwise, do not create an empty commit.

## Phase 2 plan: project symbols

Add label, bibliography-key, and file-reference extractors to `latex_completion.rs`; expose them only in their corresponding command arguments. Add fixtures for duplicate labels, comma-separated cite keys, local bibliography files, and stale active-document content. The CodeMirror source remains unchanged except for mapping the new kinds.

## Phase 3 plan: incremental index

Introduce a `LatexIntelligenceIndex` Tauri managed state keyed by canonical project root and validated source revisions. Invalidate per source-path change, build snapshots outside the query lock, and use the active unsaved buffer as an overlay. Benchmark projects with 1,000 sources and assert query latency independently from initial indexing.

## Phase 4 plan: capability breadth and polish

Grow capability data in focused modules with fixtures for every package/class added. Add a compact manual-completion explanation only when a user explicitly invokes completion in a valid but empty context; retain no automatic popup in prose. Perform keyboard and screen-reader testing on the popup and information region.
