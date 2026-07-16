# TeX

TeX is a local-first desktop workspace for multi-file LaTeX projects. It is built with Tauri, Rust, React, TypeScript, and shadcn/ui.

The application currently supports safe local project opening, root detection,
multi-file editing and search, recovery-aware autosave, controlled LaTeX builds,
diagnostic logs, PDF viewing with retained reading state, and two-way SyncTeX
navigation. The original product direction is documented in
[docs/plans/project.md](docs/plans/project.md); the historical foundation and
security decisions are in [docs/phase-0.md](docs/phase-0.md).

## Development

Install the pinned Rust and Bun versions from
[the support policy](docs/support.md), then use the committed lockfiles:

```sh
bun install --frozen-lockfile
bun run tauri dev
```

## Quality checks

```sh
bun run lint
bun run typecheck
bun run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Release and user-facing policies:

- [Supported systems and tool versions](docs/support.md)
- [Privacy](docs/privacy.md)
- [Known limitations](docs/known-limitations.md)
- [Project build configuration](docs/project-build-configuration.md)

Read [AGENTS.md](AGENTS.md) and [docs/code-quality.md](docs/code-quality.md)
before contributing.
