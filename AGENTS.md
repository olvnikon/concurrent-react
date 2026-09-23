# Concurrent React community call

## Purpose

Build a small, understandable collection of live examples about Concurrent React,
educational reconstructions of its internals, and accompanying slide text.
Assume familiarity with components and hooks; explain internals progressively.
Optimize for code the presenter can explain and the audience can follow.
Work within the current request: preparation, implementation, and slides are
separate stages, not automatic permission to complete every future deliverable.

## Reference boundaries

- `react/` is the user's read-only upstream checkout. Never edit, format, install,
  build, generate files, change branches, or run mutating Git commands there.
  Read source snippets and Git metadata as needed. Exclude it from broad tooling.
- Treat `react-source-v19.3.0/` as an immutable source snapshot, including its
  upstream license. Exclude it from formatting, lint fixes, and generated output.
- The research baseline is recorded in `source-manifest.json`: React 19.3.0,
  commit `1d34f91dfde6bba84d08b683aaba164c7194dacb`. The separate clone may differ.
  Check its actual revision before citing it; a version string is insufficient.
- Research documents and earlier AI conversations are leads to verify. For a
  production implementation claim, inspect the relevant source and feature flags;
  distinguish stable public behavior, revision-specific internals, and toy models.
- Cite source file, symbol, and commit; use verified line ranges for upstream
  permalinks. Preserve license attribution for copied upstream snippets.

## Context routing

Read the material relevant to the task, not the entire research pack every time.

- Talk storyline and coverage: `docs/concurrent-react-deep-talk-topics.md`.
- Compact technical context: `concurrent-react-context-pack.md`.
- Detailed research and source map: `concurrent-react-research-dossier.md`,
  `source-references.json`, and `source-manifest.json`.
- Existing teaching engine: `examples/mini-concurrent-react.mjs`.
- Isolated mechanisms: `examples/mechanisms.mjs`.
- Existing integrated browser demo: `mini-concurrent-react-demo.html`.
- Setup findings and proposed next work: `docs/project-setup.md`.

The context pack and dossier also have identical copies in `docs/` at setup.
Use the root copies as the working reference; avoid creating divergent copies.
The HTML demo embeds a copy of the engine. Engine edits must account for this
duplication if the standalone demo remains supported.

## Project skills

- `.agents/skills/react-teaching-example/SKILL.md`: creating or revising runnable
  teaching examples and miniature internals models.
- `.agents/skills/react-trace-review/SKILL.md`: reviewing profiling artifacts or
  planning/capturing a requested demo recording.
- Available session skills: Visualize for interactive explanations, Computer Use
  for browser rehearsals, and Presentations for requested slide-deck artifacts.
  Use them when relevant; plain Markdown slide text needs no deck tooling.

## Teaching examples

- Clearly label each example as **real React**, **educational reconstruction**,
  or **pseudocode**. A toy trace is evidence about that model, not a React trace.
- Give each example one main question. Prefer small named functions, explicit
  state, plain JavaScript for mechanisms, and minimal JSX for real React demos.
  Introduce abstractions only when they make the mechanism easier to follow.
- For each runnable example, document: learning objective, how to run it,
  interaction steps, expected observation, explanation, relevant source, and
  deliberate simplifications. Include reset/replay when state affects the result.
- Show the smallest mechanism first, then combine mechanisms. Do not turn this
  teaching project into a general React implementation or a large demo platform.
- Real React examples must use an explicitly selected package version. Keep their
  dependencies and tooling outside both upstream source directories.
- Keep expensive work deliberate and adjustable. To demonstrate yielding, spread
  CPU work over component/Fiber units; include a separate indivisible-function
  example to expose the limit. Keep urgent input work small.
- Distinguish browser tasks, microtasks, root scheduling, Scheduler callbacks,
  lanes, Fiber traversal, and commit. Do not imply that concurrency adds threads,
  can interrupt arbitrary JavaScript, or guarantees a paint between slices.
- Treat slice budgets as cooperative thresholds. Distinguish discarded render
  output from retained update intent. Explain which work a simplified bailout skips.
- For Suspense, separate pending work, boundary handling, notification, retry,
  and commit. Label thrown-thenable helpers as teaching mechanisms; do not present
  them as a supported production data-fetching integration. Keep promise identity
  stable when the example requires it, and distinguish suspension from CPU yielding.

## Evidence and profiling

- Existing engine verification: `node examples/verify.mjs` from the project root.
  `package.json` currently has a placeholder test script; do not claim `npm test`
  runs the suite until the script is intentionally wired up.
- Verify observable ordering and state invariants with controlled clocks/queues
  for toy mechanisms. Avoid exact wall-clock assertions for browser scheduling.
- Exercise browser demos before describing them as verified. Record browser,
  React version, build mode, Strict Mode, workload, and CPU throttling for traces.
- Pair the React DevTools Profiler with React Performance Tracks where supported
  and the browser Performance panel. Identify the evidence each view provides;
  commit counts alone do not establish interruption or abandoned render work.
- Keep instrumentation lightweight and distinguish diagnostic UI from committed
  example UI. Animation-frame callbacks are not measured paints. Scripted input
  and manually generated browser input should be labeled separately.
- Report what was run, what it established, and what remains unverified. Existing
  historical evidence is not proof that a newly changed example works.

## Slide text

Draft slide content as Markdown unless the user asks for a deck. Give each slide
one takeaway, concise on-screen text, separate speaker notes, and a demo cue or
small code snippet where useful. Put detailed citations and implementation
qualifications in the notes. Keep terminology consistent with the runnable demos;
avoid copying the dossier wholesale or presenting proposed traces as measurements.
