# Support and reproducibility policy

Status: pre-release support target
Policy revision: 2026-07-16

TeX is a local-first desktop application. The project only calls a TeX
installation already available on the user's `PATH`; it does not bundle,
download, update, or manage a TeX distribution.

## Operating systems

The first supported release targets the following 64-bit desktop systems:

| Platform | Minimum target | Architectures | Qualification baseline |
| --- | --- | --- | --- |
| Windows | Windows 11 | x86_64 | GitHub `windows-2022` build runner; end-user qualification remains required |
| macOS | macOS 12 Monterey | Apple silicon and Intel | GitHub `macos-14` build runner; end-user qualification remains required |
| Linux | Ubuntu 22.04 LTS or a distribution providing WebKitGTK 4.1 and GTK 3 equivalents | x86_64 | GitHub `ubuntu-22.04` build runner |

These are support boundaries, not claims that every distribution, desktop
environment, package combination, or older operating system works. A release
must not be described as qualified on a platform until the release checklist
has been run on that platform. Linux support is limited to the packaged format
and system-library versions exercised by the release build.

## TeX distributions and executables

The support target is:

- TeX Live 2025 or newer on Windows and Linux;
- MacTeX 2025 or newer on macOS;
- current MiKTeX on Windows 11, with packages required by the project already
  installed.

TeX installations derived from TeX Live, such as distribution packages and
BasicTeX, are expected to work when they provide the required commands and
packages, but are not independently qualified. MiKTeX is rolling-release
software, so every TeX release record must include the exact MiKTeX version and
package state used for testing.

TeX supports `latexmk`, pdfLaTeX, XeLaTeX, and LuaLaTeX build profiles. SyncTeX
navigation additionally requires the `synctex` command. BibLaTeX projects
require `biber` when selected by `latexmk`; TeX does not install missing
packages or commands.

### Current minimum tested command versions

This table records evidence, not an inferred compatibility floor. A command
without cross-platform evidence remains pre-release and must not be promoted to
a universal support claim.

| Command | Minimum tested version | Environment | Status |
| --- | --- | --- | --- |
| `latexmk` | 4.87 | TeX Live 2026, Arch Linux x86_64 | fixture builds verified locally |
| `pdflatex` | pdfTeX 1.40.29 | TeX Live 2026, Arch Linux x86_64 | direct fixture build verified locally |
| `xelatex` | XeTeX 0.999998 | TeX Live 2026, Arch Linux x86_64 | direct fixture build verified locally |
| `lualatex` | LuaHBTeX 1.24.0 | TeX Live 2026, Arch Linux x86_64 | direct fixture build verified locally |
| `synctex` | CLI 1.5 / synchronization library 1.21 | TeX Live 2026, Arch Linux x86_64 | command and existing fixture verified locally |
| `biber` | not yet qualified | dedicated fixture committed | release gate remains open |

The minimum-tested table is updated only from a recorded successful run. Older
versions may work, but are unsupported until they have equivalent evidence.

## Development toolchain policy

- Rust `1.88.0` is both the declared MSRV and the pinned repository toolchain.
  It is the highest minimum required by the current locked dependency graph.
- Bun `1.3.9` is required for dependency installation and frontend scripts.
- `bun.lock` and `src-tauri/Cargo.lock` are committed. CI and release builds use
  frozen/locked dependency resolution.
- Toolchain changes happen in a dedicated pull request after the full check set
  passes. The MSRV is reviewed at least quarterly and may increase before a
  stable 1.0 release; a change must update this document, `rust-toolchain.toml`,
  `package.rust-version`, and CI together.

## Reproducing the current checks

From a clean checkout, install Rust through `rustup` and Bun `1.3.9`, then run:

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

Fixture compilation is part of the Rust tests when `latexmk` is available.
Cases with an additional executable requirement, currently `biber`, are skipped
with an explicit message when that command is absent. The manifest and fixture
structure are always validated.

## Policy sources

The operating-system floor intentionally stays within the current upstream
requirements for [Tauri](https://v2.tauri.app/start/prerequisites/),
[MiKTeX](https://miktex.org/kb/prerequisites), and
[MacTeX](https://tug.org/mactex/mactex-download.html). The toolchain policy uses
Cargo's documented [`rust-version` contract](https://doc.rust-lang.org/stable/cargo/reference/rust-version.html)
and Bun's [frozen-install behavior](https://bun.sh/docs/pm/cli/install).
