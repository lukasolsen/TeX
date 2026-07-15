# Code quality standard

This standard applies to every production change. It draws on the Rust API Guidelines, CERT Rust Coding Standard, OWASP secure-design principles, TypeScript strict-mode guidance, and WCAG-oriented accessible UI practice. It is a review baseline, not a substitute for threat modelling or platform documentation.

## General

- Make behaviour explicit at trust boundaries: filesystem paths, command arguments, IPC payloads, persisted state, external file changes, and PDF/build artifacts are untrusted until validated.
- Prefer small cohesive modules with one ownership boundary. Avoid speculative abstractions and hidden global state.
- Preserve error context without including document contents, credentials, or unnecessary absolute paths in user-visible messages or logs.
- Comments explain invariants, ownership, security boundaries, or non-obvious reasoning. Do not narrate syntax, restate names, predict future work, or use subjective language.
- Public interfaces and behaviorally significant functions require concise documentation when their contract is not obvious from the type and name.
- Add a regression test for every fixed defect whose behavior can be tested deterministically.
- Treat formatting, linting, type checks, tests, and release builds as required evidence, not optional cleanup.

## Rust and Tauri

- Follow stable Rust and `rustfmt`; `cargo clippy --all-targets -- -D warnings` must pass.
- `unsafe` is forbidden. A request to introduce it requires a separate documented safety review with an explicit invariant and test strategy.
- Use `Result` for recoverable failure. Never use `unwrap`, `expect`, `panic!`, or process termination in request, command, filesystem, parsing, or build paths. The application bootstrap may use `expect` only when no recovery path exists.
- Model domain state with enums and structs; avoid stringly typed protocol states and booleans that obscure meaning.
- Keep Tauri commands thin: validate a typed request, call a domain service, return a serializable response. Commands do not contain business logic.
- Validate canonicalized paths against the approved project root before reads, writes, deletion, watching, or process invocation. Reject traversal, symlink escapes, and ambiguous roots.
- Never build a shell command from concatenated strings. Use `std::process::Command` with fixed executable selection and separately supplied arguments. `shell-escape` and project-provided commands require visible, explicit consent.
- Apply least privilege to Tauri capabilities. Add filesystem, shell, dialog, or network permissions only for an implemented feature, scoped to the smallest path/operation set.
- Use atomic write patterns for state that protects user work: write a sibling temporary file, flush/sync as appropriate, then rename. Preserve a recovery path on failure.
- File-watch events are hints, not truth. Debounce/coalesce events and re-stat/re-read before acting; handle rename and remove explicitly.
- Logs use stable event names and metadata, never document contents. Do not log full build commands when arguments may reveal sensitive paths or values.
- `Serialize`/`Deserialize` contracts use explicit field naming and narrowly typed payloads. Do not expose internal errors, paths, or handles over IPC.

## React and TypeScript

- TypeScript remains in strict mode. Do not use `any`, unchecked type assertions, non-null assertions, or `@ts-ignore` to bypass a contract. Narrow `unknown` at the boundary that receives it.
- Keep React components declarative and focused on presentation/state coordination. Filesystem access, build execution, and persistence stay behind typed Tauri IPC functions.
- Prefer named domain types and discriminated unions for loading, error, build, and external-change states. A UI must render all states deliberately.
- Effects synchronize with external systems only. Do not derive ordinary render data in an effect; keep dependencies complete and cleanup subscriptions, timers, and async cancellation paths.
- Keep handlers accessible by default: native semantics first, visible focus, keyboard operation, labels for controls, and text equivalents for status/colour/icon signals.
- Use shadcn components already present in the project before adding a dependency or custom primitive. Use semantic Tailwind tokens and `cn()` for conditional classes.
- Do not suppress focus, selection, or scrolling globally unless the behavior is necessary to the editor workflow and has keyboard and assistive-technology coverage.
- IPC calls have typed request/response models, an explicit pending/error state, and user-safe error messages. Never expose raw backend errors directly.

## Review checklist

- Does the change preserve unsaved work, reading position, focus, and the last known-good PDF?
- Are paths, commands, IPC data, and external changes validated at their trust boundaries?
- Are privileges and dependencies minimal for the behavior actually implemented?
- Is every automatic action observable, understandable, and non-destructive?
- Does the change work with keyboard navigation and assistive technology without relying on colour or pointer-only gestures?
- Are comments limited to contracts and non-obvious behavior?
- Did the applicable checks in `AGENTS.md` pass?
