---
name: react-teaching-example
description: Create or revise runnable React teaching examples and simplified internals models for this project's community call.
---

# React teaching example

Follow the repository's `AGENTS.md` for source boundaries, accuracy, profiling,
and slide conventions. Explicit user choices take precedence over this workflow.

## Choose the teaching question

Identify the single observation the audience should understand. Choose real React
when demonstrating public behavior, a miniature mechanism when exposing hidden
state, or both when the connection is the lesson. Label each accordingly.

Consult only the relevant sections of the talk outline and research. Inspect
existing examples before adding a new engine or harness. Prefer extracting a
small mechanism over making the integrated miniature more complicated.

## Make the mechanism visible

Keep the code path short enough to walk through aloud. Use descriptive state and
function names that map to the explanation. Show only the state needed for the
lesson: next work unit, current versus draft result, selected lanes, queued
updates, or pending resource and boundary state.

Provide a repeatable initial state and an obvious action. Add reset or replay
where prior state affects the result. For CPU demonstrations, make workload
adjustable; for suspension, prefer controllable resource resolution. Label any
scripted intervention so it is not mistaken for a real browser input event.

Useful mechanism-specific choices:

- Fiber: expose traversal links and the next unit; make draft publication visible.
- Scheduler: expose host turns and continuation state; separate the injected
  test clock from actual browser time.
- Lanes and queues: use noncommutative updates such as addition and multiplication
  so a broken replay order cannot accidentally produce the right result.
- Suspense: show pending, notification, retry, and publication as distinct events;
  identify which production boundary behavior the miniature omits.

Do not hide the concept behind a general-purpose framework or diagnostic UI.
If a source snippet is useful, select a small verified function and explain how
the teaching implementation differs from it.

## Deliver the example

Keep a short companion Markdown explanation beside the example, using the
existing project layout where possible. Include:

- Learning question and real-React/model classification.
- Run command or entry point, interaction steps, and reset/replay behavior.
- Expected observation and why the mechanism produces it.
- Deliberate simplifications and source file/symbol/revision mapping.
- What was verified and any remaining browser or profiling gap.

Check the relevant behavior, not just whether the code loads. Use controlled
queues and clocks for model invariants; use browser observation for responsiveness.
Do not infer real React scheduling from a miniature's tests. Draft slide text
only when requested, using the completed example's actual behavior.
