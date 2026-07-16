# Oxlint migration design

Design revision: 1  
Migration-tool run: 2026-07-16  
Input: `eslint.config.js` at baseline commit `eb95280770d2a7b15703f4ebbd3af6ca7e4af767`  
Tool: official `@oxlint/migrate`, report-only, JavaScript plugins disabled

## Decision

Oxlint will replace ESLint only after the explicit configuration provides equal
or stronger coverage for applicable rules and passes the repository. The
migration tool is evidence, not configuration authority. Its generated output
is rejected as-is because it disables the correctness category globally,
contains no JSX accessibility/import/Vitest policy, leaves
`react/exhaustive-deps` as a warning, and cannot preserve nested flat-config
glob intersections.

The production configuration will use native plugins only. Alpha JavaScript
plugins are not justified for the currently unsupported React Compiler rules;
TeX does not configure React Compiler. Type-aware mode is enabled with pinned
`oxlint-tsgolint` 0.24.0. The full repository completed in 0.53 seconds on
`arch-linux-x86_64-01`, compared with the 3.87-second ESLint baseline, and
identified thirteen discarded promise callbacks plus one redundant shortcut
contract. Typed promise ownership and switch exhaustiveness are blocking.
Experimental Oxlint type checking remains disabled; `tsc` remains independent.

## Current rule compatibility

The official converter resolved 82 rules and reported 18 skipped rules. Every resolved rule maps to the same native Oxlint rule name unless shown otherwise.

| ESLint rule | Oxlint mapping | Generated severity | Decision |
| --- | --- | --- | --- |
| `constructor-super` | native `constructor-super` | error | Adopt |
| `for-direction` | native `for-direction` | error | Adopt |
| `getter-return` | native `getter-return` | error | Adopt |
| `no-array-constructor` | native `no-array-constructor` | error | Adopt |
| `no-async-promise-executor` | native `no-async-promise-executor` | error | Adopt |
| `no-case-declarations` | native `no-case-declarations` | error | Adopt |
| `no-class-assign` | native `no-class-assign` | error | Adopt |
| `no-compare-neg-zero` | native `no-compare-neg-zero` | error | Adopt |
| `no-cond-assign` | native `no-cond-assign` | error | Adopt |
| `no-const-assign` | native `no-const-assign` | error | Adopt |
| `no-constant-binary-expression` | native `no-constant-binary-expression` | error | Adopt |
| `no-constant-condition` | native `no-constant-condition` | error | Adopt |
| `no-control-regex` | native `no-control-regex` | error | Adopt |
| `no-debugger` | native `no-debugger` | error | Adopt |
| `no-delete-var` | native `no-delete-var` | error | Adopt |
| `no-dupe-class-members` | native `no-dupe-class-members` | error | Adopt |
| `no-dupe-else-if` | native `no-dupe-else-if` | error | Adopt |
| `no-dupe-keys` | native `no-dupe-keys` | error | Adopt |
| `no-duplicate-case` | native `no-duplicate-case` | error | Adopt |
| `no-empty` | native `no-empty` | error | Adopt |
| `no-empty-character-class` | native `no-empty-character-class` | error | Adopt |
| `no-empty-pattern` | native `no-empty-pattern` | error | Adopt |
| `no-empty-static-block` | native `no-empty-static-block` | error | Adopt |
| `no-ex-assign` | native `no-ex-assign` | error | Adopt |
| `no-extra-boolean-cast` | native `no-extra-boolean-cast` | error | Adopt |
| `no-fallthrough` | native `no-fallthrough` | error | Adopt |
| `no-func-assign` | native `no-func-assign` | error | Adopt |
| `no-global-assign` | native `no-global-assign` | error | Adopt |
| `no-import-assign` | native `no-import-assign` | error | Adopt |
| `no-invalid-regexp` | native `no-invalid-regexp` | error | Adopt |
| `no-irregular-whitespace` | native `no-irregular-whitespace` | error | Adopt |
| `no-loss-of-precision` | native `no-loss-of-precision` | error | Adopt |
| `no-misleading-character-class` | native `no-misleading-character-class` | error | Adopt |
| `no-new-native-nonconstructor` | native `no-new-native-nonconstructor` | error | Adopt |
| `no-nonoctal-decimal-escape` | native `no-nonoctal-decimal-escape` | error | Adopt |
| `no-obj-calls` | native `no-obj-calls` | error | Adopt |
| `no-prototype-builtins` | native `no-prototype-builtins` | error | Adopt |
| `no-redeclare` | native `no-redeclare` | error | Adopt |
| `no-regex-spaces` | native `no-regex-spaces` | error | Adopt |
| `no-self-assign` | native `no-self-assign` | error | Adopt |
| `no-setter-return` | native `no-setter-return` | error | Adopt |
| `no-shadow-restricted-names` | native `no-shadow-restricted-names` | error | Adopt |
| `no-sparse-arrays` | native `no-sparse-arrays` | error | Adopt |
| `no-this-before-super` | native `no-this-before-super` | error | Adopt |
| `no-unassigned-vars` | native `no-unassigned-vars` | error | Adopt |
| `no-unexpected-multiline` | native `no-unexpected-multiline` | error | Adopt |
| `no-unreachable` | native `no-unreachable` | error | Adopt |
| `no-unsafe-finally` | native `no-unsafe-finally` | error | Adopt |
| `no-unsafe-negation` | native `no-unsafe-negation` | error | Adopt |
| `no-unsafe-optional-chaining` | native `no-unsafe-optional-chaining` | error | Adopt |
| `no-unused-expressions` | native `no-unused-expressions` | error | Adopt |
| `no-unused-labels` | native `no-unused-labels` | error | Adopt |
| `no-unused-private-class-members` | native `no-unused-private-class-members` | error | Adopt |
| `no-unused-vars` | native `no-unused-vars` | error | Adopt |
| `no-useless-backreference` | native `no-useless-backreference` | error | Adopt |
| `no-useless-catch` | native `no-useless-catch` | error | Adopt |
| `no-useless-escape` | native `no-useless-escape` | error | Adopt |
| `no-with` | native `no-with` | error | Adopt |
| `preserve-caught-error` | native `preserve-caught-error` | error | Adopt |
| `react/exhaustive-deps` | native `react/exhaustive-deps` | warn | Adopt as error |
| `react/only-export-components` | native `react/only-export-components` | error | Adopt |
| `react/rules-of-hooks` | native `react/rules-of-hooks` | error | Adopt |
| `require-yield` | native `require-yield` | error | Adopt |
| `typescript/ban-ts-comment` | native `typescript/ban-ts-comment` | error | Adopt |
| `typescript/no-duplicate-enum-values` | native `typescript/no-duplicate-enum-values` | error | Adopt |
| `typescript/no-empty-object-type` | native `typescript/no-empty-object-type` | error | Adopt |
| `typescript/no-explicit-any` | native `typescript/no-explicit-any` | error | Adopt |
| `typescript/no-extra-non-null-assertion` | native `typescript/no-extra-non-null-assertion` | error | Adopt |
| `typescript/no-misused-new` | native `typescript/no-misused-new` | error | Adopt |
| `typescript/no-namespace` | native `typescript/no-namespace` | error | Adopt |
| `typescript/no-non-null-asserted-optional-chain` | native `typescript/no-non-null-asserted-optional-chain` | error | Adopt |
| `typescript/no-require-imports` | native `typescript/no-require-imports` | error | Adopt |
| `typescript/no-this-alias` | native `typescript/no-this-alias` | error | Adopt |
| `typescript/no-unnecessary-type-constraint` | native `typescript/no-unnecessary-type-constraint` | error | Adopt |
| `typescript/no-unsafe-declaration-merging` | native `typescript/no-unsafe-declaration-merging` | error | Adopt |
| `typescript/no-unsafe-function-type` | native `typescript/no-unsafe-function-type` | error | Adopt |
| `typescript/no-wrapper-object-types` | native `typescript/no-wrapper-object-types` | error | Adopt |
| `typescript/prefer-as-const` | native `typescript/prefer-as-const` | error | Adopt |
| `typescript/prefer-namespace-keyword` | native `typescript/prefer-namespace-keyword` | error | Adopt |
| `typescript/triple-slash-reference` | native `typescript/triple-slash-reference` | error | Adopt |
| `use-isnan` | native `use-isnan` | error | Adopt |
| `valid-typeof` | native `valid-typeof` | error | Adopt |

## Skipped rules

| ESLint rule | Converter classification | Decision |
| --- | --- | --- |
| `no-undef` | Nursery | Defer: TypeScript covers application names; evaluate Oxlint nursery only for JavaScript config files. |
| `no-useless-assignment` | Nursery | Defer: evaluate diagnostic stability; TypeScript does not fully replace it. |
| `no-dupe-args` | Superseded | Reject migration: strict-mode parser/compiler enforcement. |
| `no-octal` | Superseded | Reject migration: strict-mode parser/compiler enforcement. |
| `react-hooks/static-components` | Unsupported React Compiler | Defer; do not add alpha JS plugins solely for compiler diagnostics. |
| `react-hooks/use-memo` | Unsupported React Compiler | Defer; do not add alpha JS plugins solely for compiler diagnostics. |
| `react-hooks/preserve-manual-memoization` | Unsupported React Compiler | Defer; do not add alpha JS plugins solely for compiler diagnostics. |
| `react-hooks/incompatible-library` | Unsupported React Compiler | Defer; do not add alpha JS plugins solely for compiler diagnostics. |
| `react-hooks/immutability` | Unsupported React Compiler | Defer; retain reviewer/type coverage pending native support. |
| `react-hooks/globals` | Unsupported React Compiler | Defer; retain reviewer/type coverage pending native support. |
| `react-hooks/refs` | Unsupported React Compiler | Defer; retain reviewer tests pending native support. |
| `react-hooks/set-state-in-effect` | Unsupported React Compiler | Defer; enforce the engineering effect rule by review/tests. |
| `react-hooks/error-boundaries` | Unsupported React Compiler | Defer; review error-boundary ownership separately. |
| `react-hooks/purity` | Unsupported React Compiler | Defer; retain render-purity review. |
| `react-hooks/set-state-in-render` | Unsupported React Compiler | Defer; React runtime/compiler and review remain controls. |
| `react-hooks/unsupported-syntax` | Unsupported React Compiler | Defer; no React Compiler is configured. |
| `react-hooks/config` | Unsupported React Compiler | Reject as inapplicable until React Compiler configuration exists. |
| `react-hooks/gating` | Unsupported React Compiler | Reject as inapplicable until React Compiler gating exists. |

## Required additional coverage

The ESLint baseline is not the target standard. Evaluate and enable explicit
native rules for:

- JSX accessibility: semantic controls, names, keyboard/pointer parity, focus,
  ARIA validity, and status messaging;
- imports: unresolved paths, cycles, duplicates, type-only imports, and
  unsupported side-effect boundaries;
- TypeScript: assertions, unsafe escape hatches, exhaustive switches, exported
  return types, promises, and readonly contracts where reliable;
- React: Hooks correctness at error severity, cleanup-sensitive patterns,
  component exports, unstable keys, and measured render-risk rules;
- Vitest: focused/disabled tests, assertion validity, hook ordering, and promise
  ownership;
- base correctness and suspicious rules selected explicitly beyond the migrated
  ESLint set.

Do not enable style, pedantic, restriction, nursery, or performance categories
wholesale. Record every non-obvious rule in `rule-decisions.md` with false-positive
risk and migration impact.

## Migration sequence

1. Add pinned Oxlint and a schema-backed root `.oxlintrc.json`.
2. Reproduce all adopted mappings above; set every enabled rule to error.
3. Add the approved native plugin coverage and explicit ignores/overrides.
4. Run report-only, classify each diagnostic, and fix behavior before style.
5. Measure untyped and typed Oxlint against the ESLint baseline. Record pinned
   companion compatibility before making typed rules blocking.
6. Run Oxlint and ESLint once as a compatibility check. Do not retain the dual
   gate after equivalence is proved.
7. Change `bun run lint` and CI to Oxlint with zero warnings; remove ESLint
   configuration and packages in the same cohesive migration commit.
8. Verify lint, typecheck, tests, build, lockfile diff, and editor integration.

## Deletion gate

Delete ESLint only when no applicable baseline rule is lost, unsupported rules
have the decisions above, Oxlint passes with warnings denied, and the lockfile
shows no unrelated dependency movement. TypeScript remains a separate required
gate. Prettier remains a separate formatter.
