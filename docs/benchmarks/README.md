# Benchmark protocol

Protocol revision: 1
Revision date: 2026-07-16

This protocol makes TeX performance claims comparable and reproducible. It
defines measurement, but it does not turn uncollected data into a claim. Raw
samples and a completed environment record must accompany every published
result.

## Required environment record

Copy [`result-template.md`](result-template.md) for each run and record:

- commit SHA and dirty-worktree state;
- fixture name plus the fixture-manifest SHA-256 or commit SHA;
- operating system version, architecture, CPU model/core count, memory, storage
  type, display resolution/scaling, and power mode;
- Rust, Bun, application, WebView, TeX distribution, engine, `latexmk`, `biber`,
  and SyncTeX versions relevant to the scenario;
- debug or release mode and the exact build command;
- cold/warm definition, warm-up count, measured sample count, and any excluded
  samples with a reason.

Reference environments are inventory entries, not benchmark results. The first
recorded machine is in [`reference-machines.md`](reference-machines.md).

## Timing method

Use a monotonic high-resolution clock. Record raw durations in milliseconds as
one value per line in a UTF-8 text file; do not round raw values. Unless a
scenario says otherwise:

1. Close unrelated CPU-, disk-, and GPU-intensive applications and connect AC
   power.
2. Build the exact commit in release mode. Debug numbers may be recorded for
   diagnosis but cannot support release claims.
3. Perform 5 unmeasured warm-up runs for warm scenarios.
4. Collect at least 50 samples for direct UI operations and 30 samples for
   startup, project open, build, and PDF replacement. A release claim should use
   100 samples when the operation completes in under one second.
5. Keep failures as separately classified samples. Do not delete outliers. A
   setup error may be excluded only when the raw record and reason remain.
6. Sort successful samples ascending. Use nearest-rank percentiles: rank is
   `ceil(p * n)`, one-based. Report p50, p95, p99, sample count, minimum, and
   maximum. If fewer than 100 samples exist, label p99 as the observed maximum
   and do not imply statistical confidence.

Clock start and end points must be emitted from the owning layer where possible;
screen recordings are only a fallback and must be labeled as such.

## Scenarios

| Scenario | Start | End | Fixture/state |
| --- | --- | --- | --- |
| Cold startup | process spawn request | first actionable project-home frame | app data reset; OS cache state recorded |
| Warm startup | process spawn request | first actionable project-home frame | app previously launched; app data retained |
| Project open | folder selection accepted | editor/tree shell ready for input | `large-project` |
| Keystroke | editor input event timestamp | corresponding painted frame | middle chapter of `large-project` |
| File switch | source tab activation | target editor content painted and focused | `large-project` |
| Project search | query submitted after debounce | final result count rendered | fixed query from fixture manifest |
| Build start | Build action acknowledged | child-process spawn confirmed | `simple-article` and `large-project` |
| Log update | process output received | corresponding log text painted | `broken-build` |
| PDF replacement | replacement accepted | retained page/view state painted from new PDF | `nasa-technical-report` |

Cold-cache tests must document how caches were cleared. If the operating system
does not offer a safe, repeatable method, label the scenario “first process run”
rather than “cold disk cache.” User input, selection, focus, pane geometry, PDF
page/position/zoom/layout, and last-known-good behavior are correctness checks
alongside timing; a fast sample that violates one is a failed sample.

## Artifact layout

Store approved evidence under a dated directory:

```text
docs/benchmarks/results/YYYY-MM-DD-machine-scenario/
  environment.md
  samples-ms.txt
  summary.md
```

Do not commit document contents, user paths, usernames, machine serial numbers,
or other private identifiers. Use repository fixtures only.
