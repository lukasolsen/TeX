# Engineering rule decisions

Register revision: 1  
Decision date: 2026-07-16  
Owner: TeX maintainers  
Next policy review: 2027-01-16

The complete original maintainer wording remains verbatim in
`docs/plans/code-review-plan.md` under each stable rule ID. The quotations below
preserve each proposal's operative wording; the plan remains the authoritative
proposal record. Adoption applies the revised rule in
`docs/engineering-standard.md`, not an unreviewed example from the proposal.

## Maintainer proposals

| ID | Original operative wording | Decision | Rationale and implementation | Enforcement / exception / migration |
| --- | --- | --- | --- | --- |
| TEX-ARCH-001 | “React and TypeScript code MUST be treated as an untrusted presentation layer.” “Every privileged request MUST be revalidated in Rust.” | **Adopt** | This is the fundamental desktop trust boundary. Capability checks and Rust validation are complementary controls. | Command/service review, adversarial tests, capability audit. No exception for privileged operations. Migrate direct assumptions per Waves B–E. |
| TEX-ARCH-002 | “Each Tauri window or webview MUST receive only the capabilities it requires.” “Capabilities MUST be divided by responsibility rather than collecting all permissions in one global capability.” | **Adopt with revision** | Least authority is mandatory. File separation is not itself isolation: Tauri merges capabilities assigned to one window. Split capabilities only when window/webview assignment or ownership becomes materially clearer; do not create decorative files. | Capability diff review and generated-permission inspection. Exceptions require threat-model entry. Migrate `default` permissions to exact grants where supported. |
| TEX-ARCH-003 | “Data MUST flow through identifiable layers.” “Components MUST NOT invoke arbitrary Tauri commands directly.” | **Adopt** | A visible gateway/command/service path makes validation ownership and wire compatibility reviewable. Small operations may combine controller and gateway only when ownership stays explicit. | Import lint/search, service boundary review. No component-level `invoke`; migrate plugin dialog use behind a named gateway. |
| TEX-ARCH-004 | “All data entering a trust boundary MUST be parsed or validated.” “A TypeScript annotation is not runtime validation.” | **Adopt** | Static annotations are erased. Parsing depth must match risk; do not introduce ceremonial schemas for local compile-time-only values. | Boundary parsers and negative tests. Exceptions identify the upstream invariant and compensating test. Migrate IPC/event/persistence/worker inputs. |
| TEX-ARCH-005 | “Use discriminated unions instead of combinations of booleans.” | **Adopt with revision** | Discriminated unions are required for state machines and mutually exclusive states. Independent orthogonal flags may remain booleans. | Type review and exhaustive branching lint/tests. Migrate contradictory async state first. |
| TEX-TS-001 | “Explicit and inferred any MUST NOT be introduced into application code.” | **Adopt** | Maintained code must narrow unknown values. Third-party declaration `any` is handled at an adapter; it does not justify propagation. | Oxlint `typescript/no-explicit-any`, compiler, review. Exact-site exception only for an upstream declaration defect with expiry. |
| TEX-TS-002 | “The following MUST NOT be used without a documented proof: `value!`, `value as SomeType`, `value as unknown as SomeType`.” | **Adopt** | Assertions are permitted only for a local invariant that TypeScript cannot express, never to claim external validity. | Oxlint assertion rules plus review. Proof/test required at exact site. Migrate trust-boundary assertions to parsers. |
| TEX-TS-003 | “Discriminated unions MUST be exhaustively handled.” | **Adopt** | Exhaustiveness prevents silent protocol/state drift. Security parsers reject unknown variants. | Type-aware exhaustive-switch rule if stable; otherwise `never` helper and tests. No silent default branch. |
| TEX-TS-004 | “Semantically different identifiers and paths MUST NOT all be plain strings.” | **Adopt with revision** | Brand authority-bearing and easily confused scalars with an enforced constructor. Universal branding would obscure important distinctions and add casts without runtime value. | API review and parser constructors. Exceptions unnecessary for ordinary display strings. Migrate paths, revisions, build IDs, and coordinate systems first. |
| TEX-TS-005 | “Types crossing module boundaries SHOULD use readonly properties and readonly collections.” | **Adopt** | Readonly contracts make ownership explicit without banning controlled local mutation. | Type review; advisory lint where reliable. Migrate shared domain and IPC contracts opportunistically with owning wave. |
| TEX-TS-006 | “Functions MUST NOT accept multiple adjacent primitive arguments when their meaning can be confused.” | **Adopt** | Named request objects prevent positional swaps and scale contract evolution. | API review. Small conventional callbacks are exempt. Migrate service gateways and coordinate/file operations. |
| TEX-TS-007 | “Boolean parameters that materially change behavior MUST be replaced with named options or unions.” | **Adopt** | Behavior modes deserve named semantics; ordinary predicate setters and platform APIs are not mode parameters. | API review and selected lint. Migrate save/search/replace/create modes. |
| TEX-TS-008 | “Every exported function MUST declare its return type.” | **Adopt** | Explicit exported return types prevent accidental public-contract expansion. | TypeScript/Oxlint rule. React component return annotations are required for exported components unless tool compatibility proves a concrete conflict. |
| TEX-TS-009 | “Every promise MUST have an explicit owner: await it; return it; aggregate it; or intentionally detach it through a named helper.” | **Adopt** | Unowned rejections and stale completions are correctness defects. | Type-aware `no-floating-promises`, `no-misused-promises`, `await-thenable` after measured adoption; review until then. Exact detached helper only. |
| TEX-TS-010 | “Application failures MUST NOT be represented only as free-form strings.” | **Adopt** | Stable codes support safe presentation and exhaustive recovery. Diagnostic text remains evidence, not control flow. | Domain types, IPC contract tests, no message-branching review. Migrate existing `{ code, message }` to bounded code unions. |
| TEX-ORG-001 | “A file containing React rendering logic MUST NOT declare domain types, enums, command contracts, or reusable interfaces.” “A component file MAY import its props type but MUST NOT define it inline.” | **Adopt with revision** | Domain/IPC declarations are prohibited in render files. A small private props type may remain beside one component; mandatory extraction of every props type creates navigation cost without independent ownership. | Module review and dependency rules. Extract exported/reused/semantically significant props during Wave F/H; do not perform file-count churn. |
| TEX-ORG-002 | “Files named only types.ts, interfaces.ts, models.ts, or enums.ts MUST NOT accumulate unrelated declarations.” | **Adopt** | Generic declaration dumps erase ownership. A tightly cohesive domain module may contain several related declarations regardless of filename. | File review and cycle analysis. Rename/split only with a concrete ownership finding. |
| TEX-ORG-003 | “Prefer string-literal unions or as const objects over TypeScript enum.” | **Adopt** | Runtime enums require a concrete interoperability or mapping need. `const enum` is unsuitable across package/module compilation boundaries. | `erasableSyntaxOnly`, review, Oxlint. Migrate only when behavior remains identical. |
| TEX-DOC-001 | “Every exported type, interface, class, function, hook, constant with semantic significance, Tauri gateway method, validation function MUST have a documentation comment.” | **Adopt with revision** | Document contracts whose invariants, authority, ordering, failure, or side effects are not evident. Requiring comments on self-evident exports would reward repetition and increase drift. | Reviewer gate; missing-doc lint only on selected public/security surfaces. No blanket comment migration. |
| TEX-DOC-002 | “Non-exported code MUST also be documented when it handles [security- and consistency-critical behavior].” | **Adopt** | Critical invariants must be reviewable at their enforcement site. Comments describe the actual control, not a security adjective. | Security review and targeted lint/search. Missing rationale is a finding; exceptions require equally durable external contract reference. |
| TEX-DOC-003 | “A contract comment SHOULD answer the applicable questions [purpose, meaning, invariants, trust, ownership, failure, side effects, concurrency, security, rationale].” | **Adopt** | The list is a relevance checklist, not a mandated template. Prohibited narration and stale history remain prohibited. | Reviewer inspection. Migrate comments only where a contract is absent or misleading. |

## Imported rules

| ID | Source | Decision | Repository rule and enforcement |
| --- | --- | --- | --- |
| EXT-RUST-001 | SRC-RUST-002 | **Adopt** | Keep declared MSRV synchronized across manifest, toolchain, and CI; verify it before release. |
| EXT-RUST-002 | SRC-RUST-004 | **Adopt** | Deny warnings; evaluate Clippy pedantic/restriction/nursery lints individually. Blanket groups are prohibited. |
| EXT-TAURI-001 | SRC-TAURI-002 | **Adopt** | Review effective per-window permission union, not capability-file count. |
| EXT-TAURI-002 | SRC-TAURI-003 | **Adopt** | No remote code; explicit minimum CSP. New origins/schemes require threat-model review. |
| EXT-TS-001 | SRC-TS-002 | **Adopt** | Enable `noUncheckedIndexedAccess` after migration and retain as an error gate. |
| EXT-TS-002 | SRC-TS-003 | **Adopt** | Enable `exactOptionalPropertyTypes`; model absent versus present-undefined deliberately. |
| EXT-TS-003 | SRC-TS-004 | **Adopt** | Keep catch variables unknown and classify errors once. |
| EXT-REACT-001 | SRC-REACT-001 | **Adopt** | Effects only synchronize external systems and must clean up symmetrically. |
| EXT-REACT-002 | SRC-REACT-002 | **Adopt** | A key/type change that resets editor/PDF state requires explicit restoration evidence. |
| EXT-CM-001 | SRC-CM-001 | **Adopt** | Destroy every owned editor view/plugin and avoid synchronous layout reads in update paths. |
| EXT-PDF-001 | SRC-PDF-001 | **Adopt** | Cancel/destroy superseded loading/render tasks and preserve last-good output until replacement succeeds. |
| EXT-OXC-001 | SRC-OXC-001 | **Adopt** | Replace ESLint with explicit native Oxlint coverage and zero warnings. |
| EXT-OXC-002 | SRC-OXC-003 | **Adopt after measurement** | Oxlint 1.74.0 with `oxlint-tsgolint` 0.24.0 completes the full repository in 0.53 s and cleanly enforces promise ownership/exhaustiveness. `tsc` remains an independent required gate; experimental Oxlint type checking remains rejected. |
| EXT-DEPS-001 | SRC-DEPS-001 | **Adopt** | Enforce Rust advisories, yanked packages, approved licences, registry-only sources, and wildcard bans; retain duplicate versions as visible review warnings. |
| EXT-DEPS-002 | SRC-DEPS-002 | **Adopt** | Fail CI for high/critical frontend advisories and retain frozen installation plus dependency-diff review. |
| EXT-OWASP-001 | SRC-OWASP-001 | **Adopt with revision** | Map applicable ASVS controls to the desktop threat model; do not claim formal ASVS conformance. |
| EXT-OWASP-002 | SRC-OWASP-002 | **Adopt** | Fixed executable plus separate validated arguments; no shell command construction. |
| EXT-GH-001 | SRC-GH-001 | **Adopt** | Pin every third-party Action to a verified full commit SHA with a version comment. |
| EXT-GH-002 | SRC-GH-002 | **Adopt** | Set job-level minimum token permissions; release write authority exists only in the publishing job. |
| EXT-GH-003 | SRC-GH-003 | **Adopt with fallback** | Add dependency review when available and retain ecosystem-native audit/licence/source gates. |
| EXT-A11Y-001 | SRC-A11Y-001 | **Adopt** | WCAG 2.2 AA is the target; native semantics precede ARIA and changed workflows require keyboard/AT evidence. |
| EXT-A11Y-002 | SRC-A11Y-002 | **Adopt** | Every semantic surface/foreground token maps to CSS system colors in forced-colors mode; custom accent values cannot outrank that mapping, and browser-owned controls receive an explicit color scheme. |
| EXT-A11Y-003 | SRC-A11Y-003 | **Adopt with limitation** | Run axe-core against changed primary DOM workflows. JSDOM may disable only rules the tool documents as unsupported; every such omission remains assigned to real-browser and packaged-app qualification. A zero-violation scan is not a WCAG conformance claim. |
| EXT-TEST-001 | SRC-TEST-001, SRC-TEST-002 | **Adopt** | Component tests query accessible roles, names, descriptions, and states and drive complete user interactions in file-scoped JSDOM. Keep implementation-state assertions and test IDs out of public workflow contracts unless no user-observable locator exists. |

## Approval and migration decision

Version 1.0 of the engineering standard adopts the decisions above. Enforcement
is staged by the review waves because the baseline predates several rules.
Staging is not an exception: every violation remains a finding until fixed or
entered in `exceptions.md`. The standard may change only through a decision row
that records source, impact, enforcement, and migration consequences.
