# Markdown Editor Hover Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fixed LaTeX hover cards with a local Markdown documentation catalog and safe, accessible hover rendering.

**Architecture:** A feature-local immutable catalog supplies command, class, and package Markdown by narrow lookup helpers. The hover module keeps its existing caller-owned command scan and file-reference precedence, then renders catalog entries, generic dependency fallbacks, and project-file previews through one DOM-only Markdown renderer.

**Tech Stack:** React/TypeScript, CodeMirror, Vitest, DOM APIs.

## Global Constraints

- Preserve project-file preview, error, comment-exclusion, and navigation behaviour.
- Accept no HTML and only `https:` links in rendered Markdown.
- Keep the source scan caller-owned and run it once per hover query.
- Add no dependency, network request, Tauri capability, or mock capability.

---

### Task 1: Catalog lookup contract

**Files:**
- Create: `src/features/editor/latex-documentation.ts`
- Test: `src/features/editor/latex-hover.test.ts`

- [x] Add failing lookup tests for recognised commands, classes, packages, and unknown names.
- [x] Run `bun run test src/features/editor/latex-hover.test.ts` and verify the new imports fail because the catalog does not exist.
- [x] Create the immutable, alphabetised Markdown catalog with narrow command/class/package lookup helpers.
- [x] Re-run the focused test file and verify catalog lookup tests pass.

### Task 2: Safe Markdown hover renderer

**Files:**
- Modify: `src/features/editor/latex-hover.ts`
- Test: `src/features/editor/latex-hover.test.ts`

- [x] Add failing DOM-level tests for headings, lists, emphasis, inline code, fenced code, safe links, unsafe schemes, and HTML-like text.
- [x] Run the focused test file and verify the renderer exports are absent.
- [x] Implement a DOM-only Markdown subset renderer and a shared article builder; no catalog string may reach `innerHTML`.
- [x] Re-run the focused test file and verify the renderer tests pass.

### Task 3: Lookup integration and responsive presentation

**Files:**
- Modify: `src/features/editor/latex-hover.ts`
- Modify: `src/features/editor/latex-editor.tsx`
- Test: `src/features/editor/latex-hover.test.ts`

- [x] Add failing tests for every supported command, comma-separated class/package positions, generic unknown dependency copy, and preserved file references/comments.
- [x] Run the focused test file and verify the new hover expectations fail.
- [x] Integrate catalog lookups in file-reference → class/package → command order; route previews and errors through the same Markdown renderer; update tooltip CSS for constrained, scrollable content and visible link focus.
- [x] Re-run the focused test file and verify all hover tests pass.

### Task 4: Verification

**Files:**
- Review: `src/features/editor/latex-documentation.ts`, `src/features/editor/latex-hover.ts`, `src/features/editor/latex-editor.tsx`

- [x] Inspect the final diff for fixed-content remnants, unsafe rendering, unrelated changes, or dependency/permission changes.
- [x] Run `bun run lint`, `bun run typecheck`, `bun run build`, `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`, and `cargo test --manifest-path src-tauri/Cargo.toml`.
