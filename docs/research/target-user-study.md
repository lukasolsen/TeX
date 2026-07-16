# Target-author research protocol

Status: recruiting; no sessions recorded
Protocol revision: 1
Revision date: 2026-07-16

Milestone 0 requires observation of 8–12 authors correcting and compiling real
LaTeX projects. This document defines how to collect useful evidence without
copying private project material into the repository. The milestone remains
open until at least eight completed sessions and an evidence-backed synthesis
are recorded.

## Recruitment matrix

Recruit authors who actively maintain existing multi-file projects. Cover every
row, with no single category accounting for more than half the sessions:

| Author/project type | Target sessions |
| --- | ---: |
| Thesis or dissertation | 2–3 |
| Research paper or proceedings submission | 2–3 |
| Book or long report | 2–3 |
| Technical/scientific document or manual | 2–3 |

Seek variation in operating system, TeX distribution, project age, project size,
collaboration/version-control practice, and accessibility needs. Record only
broad ranges and volunteered workflow context, never demographic information
that is not required to understand the editing workflow.

## Consent and privacy

Before observation, explain that the session studies workflow rather than the
document, participation is voluntary, and the participant can pause or stop at
any time. Do not record screen, audio, source, PDF, logs, filenames, paths,
citations, credentials, institutional details, or document excerpts unless a
separate explicit consent and retention decision exists. The default is
observer notes containing only generalized actions and timing ranges.

Do not ask participants to upload projects or copy private content into TeX,
issues, fixtures, chat, or the repository. Convert examples into synthetic
reproductions before filing an issue. Participants must approve any attributed
quote; prefer unattributed paraphrase.

## Session procedure (45–60 minutes)

1. Record a random session identifier, project category, OS, TeX distribution,
   editor/build workflow, and broad project-size range.
2. Ask the participant to use their normal tools to complete one real correction
   cycle: locate a source, edit, build, inspect a failure or warning if one
   occurs, compare the PDF, and navigate between output and source.
3. Observe without teaching. Record actions, visible state transitions,
   hesitation points, workarounds, context loss, recovery behavior, and whether
   the participant could explain the current build/save state.
4. Repeat the highest-friction step in TeX when safe and when the participant is
   comfortable using a development build. Do not import the project; open it
   locally in place.
5. Ask what they expected, what evidence made them trust or distrust the result,
   and which workaround they consider normal.
6. Read back generalized observations and let the participant correct or remove
   them.

## Session record

Create one local note from this schema, then commit only its redacted fields:

```text
Session ID: SNN
Date:
Project category:
OS / TeX distribution:
Project size range: files / approximate pages
Workflow stages observed:
Recurring-friction codes:
Generalized observations:
Expected behavior:
Safety/context impact:
Synthetic reproduction needed: yes/no
Participant reviewed redaction: yes/no
```

The committed research log must contain no names, contacts, employer or
institution, project title, source text, paths, filenames, screenshots, logs, or
unique document details.

## Synthesis and issue threshold

Maintain a friction codebook while sessions proceed. File an evidence-backed
issue when either:

- the same friction occurs independently in at least three sessions; or
- one occurrence risks data loss, unsafe command execution, inaccessible core
  workflow, or unrecoverable context loss.

Each issue records session IDs, affected workflow stage, generalized evidence,
severity, current workaround, a synthetic reproduction or fixture, acceptance
criteria, and which product invariant is involved. Do not attach private
content. Findings that do not meet the threshold remain in the synthesis rather
than becoming speculative roadmap commitments.

## Completion record

When the study completes, add `docs/research/target-user-study-results.md` with
the recruitment matrix totals, redacted friction frequencies, issue links,
negative findings, limitations, and date range. Research completion requires
8–12 valid sessions and review confirming that no private content was imported.
