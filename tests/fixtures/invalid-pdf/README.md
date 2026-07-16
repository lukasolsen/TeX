# Invalid PDF fixture

`truncated.pdf` has a plausible PDF header and partial object graph but no
completed page object, cross-reference table, trailer, or end marker. It must
be rejected without replacing a currently readable PDF. The file is synthetic
and development-only.
