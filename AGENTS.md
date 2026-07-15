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
