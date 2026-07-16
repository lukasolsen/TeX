# Engineering instructions

Read [docs/code-quality.md](docs/code-quality.md) and [docs/ui-ux-requirements.md](docs/ui-ux-requirements.md) before modifying source code. They are mandatory quality and product-experience baselines.

## Product constraints

- TeX is a local-first editor for existing multi-file LaTeX projects. Do not introduce accounts, telemetry, cloud storage, AI calls, or document uploads without an explicit product decision.
- Preserve user context and work. A successful PDF update must retain page, logical position, zoom, layout, and focus; a failed build must retain the last known-good PDF.
- Keep features scoped to the LaTeX editing workflow. Do not restore generic dashboard/template features.
- Build only truthful UI. Do not show mock data, unavailable actions, fake accounts, invented recent projects, or placeholder controls that imply a capability exists.

## Repository layout

- `src/`: React/TypeScript presentation layer. It does not directly access the filesystem or execute build commands.
- `src-tauri/`: Rust application boundary. It owns filesystem access, process execution, persistence, and validation.
- `docs/plans/project.md`: product decisions and release criteria.
- `docs/code-quality.md`: required implementation and review rules.

## Required verification

Run the narrowest relevant checks before handing off, then run the full applicable set for cross-cutting changes:

```sh
bun run lint
bun run typecheck
bun run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Do not modify generated bundles, `target/`, or lockfiles by hand. Keep dependency additions justified and minimal.

## Branch and pull-request workflow

Follow [docs/plans/code-review-plan.md](docs/plans/code-review-plan.md) for
hardening work and use this workflow for every substantial implementation or
review wave:

1. Inspect `git status`, the current branch, remote, recent history, and
   overlapping user changes before editing. Never discard or absorb unrelated
   work.
2. Do not make substantial review changes directly on the protected default
   branch. With a clean worktree, create a descriptive branch such as
   `review/rust-filesystem-boundary` or `feature/workspace-persistence`. If the
   worktree is dirty or branch ownership is ambiguous, ask before switching or
   creating a branch.
3. Keep each branch and PR cohesive. Separate behavior changes, broad cleanup,
   lint adoption, dependency updates, and performance work unless they are
   inseparable for correctness.
4. Run narrow checks during implementation and the full applicable verification
   before handoff. Inspect the final diff for generated files, permission or
   dependency expansion, secrets, document content, and unrelated formatting.
5. Commit intentionally without rewriting user commits. Push and open a draft
   PR only when the user requested publishing or explicitly invoked this
   workflow for delivery. Include scope, findings, tests, security/performance/
   accessibility impact, dependency and permission changes, residual risk, and
   follow-up work.
6. Monitor required checks and address branch-caused failures. Never merge,
   close the PR, force-push, or delete the branch without explicit user
   authorization.
