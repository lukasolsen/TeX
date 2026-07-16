# Engineering exception register

Register revision: 1  
Review date: 2026-07-16

No engineering-standard exceptions are approved.

An exception row must include the exact file/symbol/configuration scope,
standard rule, owner, operational reason, compensating control, linked finding,
approval, and expiry or review date. “Existing code”, migration cost, tool noise,
or a clean baseline before rule adoption is not sufficient justification.

| ID | Scope | Rule | Owner | Reason | Compensating control | Finding | Expiry/review | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | — | — | None |

Expired exceptions fail the release gate. Exceptions cannot waive source loss,
project-root escape, arbitrary command execution, credential exposure,
fabricated UI, or silent loss of the last known-good PDF.
