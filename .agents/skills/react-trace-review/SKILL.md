---
name: react-trace-review
description: Review React profiling recordings or plan and capture a requested demo trace, producing an evidence-based presenter walkthrough.
---

# React trace review

Follow the repository's `AGENTS.md` for source boundaries and evidence conventions.
Honor the user's requested analysis or recording scope; reviewing a trace does
not itself authorize changes to the demo.

## Establish what the recording can show

Identify the question and the supplied artifact: browser Performance trace,
React DevTools profile, screenshot, or a miniature's diagnostic log. Use available
tools that can actually inspect that artifact. Do not claim access to hidden
events or capture capabilities that the tool does not expose.

Record available context: browser/version, React/version, development/production/
profiling build, Strict Mode, workload, throttling, interaction, and whether the
implementation is real React or a teaching model. Mark missing context unknown.

If no trace is supplied, distinguish a requested recording from a recording plan.
For a plan, provide reproduction and capture steps without invented results.
For a requested capture, inspect available browser tooling and capture the
relevant interaction when supported. If unavailable, state the specific gap and
give the minimal manual capture steps needed to produce a usable artifact.

## Read evidence at the right layer

Follow the interaction from input handler through visible result, using timestamps
or event names actually present in the recording. Depending on the question,
inspect urgent work, background render slices, host task boundaries, commits,
Suspense waiting/retry, and layout/paint. Omit layers the recording cannot expose.

- A MessagePort callback alone does not prove it belongs to React; correlate
  stacks, marks, or React tracks when available.
- A task boundary establishes returned control, not a guaranteed paint or input
  opportunity being taken.
- A commit-focused profile cannot account for all abandoned render work.
- Render logs alone do not establish interruption; development re-invocation and
  instrumentation can change what is observed.
- Time awaiting a resource is different from CPU time spent rendering.
- Toy logs establish events in that model, not production React internals.

For comparisons, use equivalent workload and capture settings. Compare input
responsiveness and total work separately. Explain instrumentation overhead or
missing events when they materially limit the conclusion. Avoid exact-duration
claims derived from a schematic or unscaled screenshot.

## Produce a presenter walkthrough

Lead with what the evidence establishes. Give a short sequence of observed
events anchored to artifact timestamps, tracks, or screenshots. Label causal
interpretations as inferences where the recording does not establish them.
Include reproduction details, the key teaching takeaway, and unresolved limits.

Reference verified source only when it helps explain a trace; keep the runtime
version distinct from the separate cloned checkout. Preserve supplied recordings.
Save new evidence in the requested location or a clearly named folder under
`evidence/`, with capture metadata, without overwriting historical evidence.
