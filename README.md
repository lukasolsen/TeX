# TeX

TeX is a local-first desktop workspace for multi-file LaTeX projects. It is built with Tauri, Rust, React, TypeScript, and shadcn/ui.

The repository is currently in Phase 0: its UI is a minimal shell and the backend intentionally has no filesystem or compiler permission. The phase boundary, technical spikes, and fixture protocol are documented in [docs/phase-0.md](docs/phase-0.md).

## Development

```sh
bun install
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

Read [AGENTS.md](AGENTS.md) and [docs/code-quality.md](docs/code-quality.md) before contributing.
