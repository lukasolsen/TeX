# TeX

TeX is a local-first desktop workspace for multi-file LaTeX projects. It is built with Tauri, Rust, React, TypeScript, and shadcn/ui.

The application currently supports safe local project opening, root detection,
multi-file editing and search, recovery-aware autosave, controlled LaTeX builds,
diagnostic logs, PDF viewing with retained reading state, and two-way SyncTeX
navigation.

## Development

Install the pinned Rust and Bun versions from
[the support policy](docs/requirements/policies/support.md), then use the committed lockfiles:

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

- [Supported systems and tool versions](docs/requirements/policies/support.md)
- [Privacy](docs/requirements/policies/privacy.md)
- [Repository branch policy](docs/requirements/policies/repository-policy.md)

Read [AGENTS.md](AGENTS.md) and [docs/requirements/standards/code-quality.md](docs/requirements/standards/code-quality.md)
before contributing.
