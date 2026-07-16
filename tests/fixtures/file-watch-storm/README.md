# File-watch storm fixture

`events.json` is a deterministic hint stream covering repeated modify events,
an atomic-save rename, generated output churn, removal, and a later independent
source edit. The future watcher must re-stat paths, ignore `output/`, and reduce
the stream to the two documented build requests. Event timestamps are logical
fixture time, not wall-clock instructions.
