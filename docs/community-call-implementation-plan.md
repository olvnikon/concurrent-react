# Concurrent React community call: implementation plan

Status: P0–P5 implemented; recordings and slide text delivered (now 22 slides).
P6/P7 retain the manual DevTools and presenter-rehearsal steps below.
Planning assumption: 60–75 minutes plus questions, for an audience familiar with
components and hooks. Adjust pacing if the user later specifies a duration.

## Goal

Create five easy-to-follow teaching units, recordings that demonstrate concurrent
behavior in real React, and approximately 18–22 slides of presentation text.
Connect observable behavior to a small mechanism and then to a verified React
source excerpt. Keep the code short enough to explain during the call.

Minimal implementation code for Scheduler, Fiber, and Suspense is a required
deliverable. The presenter must be able to walk through each model directly in
code. Running these models is useful when it requires little extra scaffolding,
but separate runnable applications or interactive controls are not required.
The real React search and Suspense comparisons must remain runnable for profiling.

This document is the implementation handoff. Creating it does not implement the
examples. When the user requests implementation, follow the stages below in
order, record progress, and complete the requested scope without repeatedly
asking about routine implementation choices.

## Constraints

- Follow `AGENTS.md` and the user's latest instructions.
- `react/` and `react-source-v19.3.0/` are strictly read-only references. Never
  edit, format, install, build, generate output, or run mutating Git operations
  inside either directory. Exclude both from tools that write files.
- Pin the real examples to React and React DOM **19.3.0**, matching the research
  baseline `1d34f91dfde6bba84d08b683aaba164c7194dacb`. Check dependency availability
  during setup; report an unavailable version rather than silently changing it.
  The separate clone's HEAD may differ from this commit.
- Label each demonstration as real React or an educational reconstruction.
  Label non-runnable sketches as pseudocode.
- Prefer plain JavaScript for mechanisms and minimal JSX for real React.
  Avoid a general renderer, plugin system, or elaborate demo framework.
- Each example should have one main learning question. Add only controls needed
  for that question: Run, Step, Reset, workload, or resource resolution.
- Explain omitted React behavior in short comments and presenter notes. A
  simplification must preserve the behavior being taught.
- Preserve existing examples and historical evidence. If modifying duplicated
  research documents or the embedded HTML engine, keep their copies synchronized.

## Existing material to reuse

| Material                                               | Use                                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `examples/mini-concurrent-react.mjs`                   | Extract small scheduling, traversal, and queue mechanisms where useful.                 |
| `examples/mechanisms.mjs`                              | Reuse the educational resource/boundary helper.                                         |
| `examples/verify.mjs`                                  | Existing deterministic suite; currently 10 checks. Run when affected mechanisms change. |
| `mini-concurrent-react-demo.html`                      | Existing integrated miniature; optional final synthesis or backup.                      |
| `docs/accuracy-audit-2026-09-23.md`                    | Previously identified mistakes and the corrections to preserve.                         |
| `docs/concurrent-react-deep-talk-topics.md`            | Coverage inventory and source-reading paths; not a requirement to include every topic.  |
| Root research dossier/context pack and source metadata | Verify explanations and select small, pinned source excerpts.                           |

Use `.agents/skills/react-teaching-example/SKILL.md` when building examples and
`.agents/skills/react-trace-review/SKILL.md` when planning or reading recordings.
Plain Markdown slide text does not require deck-generation tooling.

## Deliverables and suggested organization

Use one lightweight demo host for the real React examples and any models that
benefit from execution. Keep each unit's teaching code independently readable;
models can live in small plain JavaScript files or fenced snippets in the guide.
Choose a minimal setup during implementation; Vite with JavaScript/JSX is a
reasonable default. Keep dependencies and build output outside the reference
directories.

Implemented locations:

- `demos/`: real React demo host and any simple runnable model demonstrations.
- `docs/demo-guide.md`: minimal model snippets or links to their files, annotated
  code walkthroughs, and launch instructions for runnable examples.
- `evidence/community-call/`: actual recordings, capture settings, and annotations.
- `docs/community-call-slides.md`: on-screen text, speaker notes, and demo cues.

Keep this plan updated with actual paths and verified commands as work progresses.
Do not add another directory structure solely to match these suggestions.

### Required minimal implementation walkthroughs

| Model              | Code to show                                                                                                          | Walkthrough                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Scheduler          | A small work queue, cooperative work loop, yield check, and a host callback that resumes work.                        | Process a few units, save the next unit, return to the host, and continue in a later task.         |
| Fiber              | A minimal node with traversal links, a next-unit function, and separate current/draft output with a publication step. | Follow a tiny tree, pause, then either discard the draft or publish the finished output.           |
| Suspense           | A cached resource with `read`, a boundary that handles pending work, and a retry notification.                        | Read pending data, select fallback or keep revealed content, settle the resource, then retry.      |
| Lanes and rebasing | Two lane bits and a compact queue-processing function.                                                                | Skip lower-priority updates, retain their ordering, and replay the queue to reach the final state. |

Build these as small educational approximations. Each walkthrough must include:

- The complete core mechanism, split into a few short snippets if needed; do not
  hide the concept inside an unexplained helper or the full existing renderer.
- A tiny input and a step-by-step explanation of state changes and expected output.
- Brief comments identifying what is simplified and what real React also handles,
  plus a verified source function/file reference in the accompanying notes.
- An accurate execution label: runnable code with run instructions when available,
  or pseudocode with an explained walkthrough. Walkthrough output must be labeled
  expected unless actually executed.

Prefer extending existing snippets or adding a few calls to run them. Do not
build a separate UI, package, or generalized engine solely to execute a model.

## Ordered implementation stages

### P0 — Establish the demo host

- [x] Inspect the current workspace and preserve unrelated changes.
- [x] Add the minimal host and exact React dependency versions.
- [x] Add working launch/build commands and an example selector.
- [x] Display each example's classification and the real app's React version.
- [x] Check profiling support early: record a small trace and confirm that the
      chosen browser/build exposes React Performance Tracks.

Acceptance: the host launches, example code is easy to locate, and profiling
capabilities are known before the main demos depend on them. A capability gap
must be recorded explicitly; continue independent example work if possible.

### P1 — Cooperative scheduling

Question: when can other browser work run?

- [x] Show the minimal Scheduler implementation: queue, work loop, cooperative
      yield check, and continuation through a host task.
- [x] Compare a single long function, small units scheduled through
      `MessageChannel`, and the same small units chained through microtasks, using
      short snippets and an annotated sequence.
- [x] If running the model adds little scaffolding, use a simple interaction or
      animation-frame counter to expose responsiveness, with adjustable work and reset.

Acceptance: the audience can identify the point where control returns to the
browser. Explain that microtasks do not provide the same task boundary and that
a budget cannot interrupt a running function. Frame callbacks are not measured
paints; task boundaries do not guarantee a paint or an input event.
An explained code walkthrough satisfies this model's delivery requirement;
browser responsiveness claims require a browser run.

Source connection: Scheduler host callback scheduling and yielding. Explain that
this example omits React's priority/deadline queues and production scheduling policy.

### P2 — Mini Fiber traversal and publication

Question: how can rendering pause without publishing an unfinished result?

- [x] Show the minimal Fiber implementation using a tiny fixed tree with
      `child`, `sibling`, and `return` links.
- [x] Show the next work unit and simple begin/complete traversal steps.
- [x] Keep current output and draft output visible as separate state.
- [x] Walk through pause, discard, and publication with a few example calls or
      annotated state changes. Add Step/Run/Reset controls only if useful and simple.

Acceptance: pausing retains traversal position; discarding a draft leaves current
output intact; publishing replaces it with the finished result. Keep any
diagnostic display distinct from the example's committed output.
Demonstrate these invariants through the code walkthrough or a small execution;
a separate interactive tree visualization is optional.

Source connection: `createWorkInProgress`, `performUnitOfWork`, and
`completeUnitOfWork`. Omit generic reconciliation, hooks, and a production effect tree.

### P3 — Priority and ordered rebasing

Question: how can urgent work skip updates without losing their order?

- [x] Show the queue-processing code with two toy lanes: urgent and transition.
- [x] Start at state 1; enqueue transition `+10`, urgent `×2`, transition `+1`.
- [x] Step through urgent processing and then the remaining queue.
- [x] Show skipped updates and replayed updates with their intermediate state.
      A short code walkthrough and state table are sufficient; no separate UI is needed.

Acceptance: urgent state is **2** and eventual state is **23**. Explain why replay
preserves insertion order and why this does not mean publishing an update twice.
Use the existing queue implementation/check as the starting point.

Source connection: `updateReducerImpl` and lane selection. Explain that React has
more lanes, per-hook queues, entanglement, and expiration; omit those mechanisms
from this small lesson.

### P4 — Real React search and the main profiling example

Question: what changes when expensive results update in a Transition?

- [x] Build controlled input and deliberately expensive result rows.
- [x] Compare ordinary updates with a version using `startTransition`, keeping
      workload and output equivalent.
- [x] Keep input state urgent; memoize the results subtree so urgent input work
      can skip unchanged results. Keep props stable where that bailout depends on them.
- [x] Put expensive calculation in individual row components for the primary
      demo. Add a variant that moves the cost into one indivisible component call.
- [x] Add a workload control and reliable reset. Keep profiler logging lightweight.

Acceptance: browser rehearsal demonstrates responsive urgent input while results
are pending under a suitable workload. A second input can arrive during the
transition render. The indivisible variant exposes the limit. Do not put one
large calculation inside the `startTransition` callback and expect it to yield.

Tune the workload on the presentation machine; do not assert exact slice lengths
or require an identical number of commits. Use actual recordings to establish
interruption rather than inferring it from a render counter.

### P5 — Suspense mechanism and real React comparison

Question: what happens when the next UI needs a resource that is not ready?

- [x] Show the minimal Suspense implementation by walking through the small
      resource/boundary helper. Make pending, notification, retry, and published
      content explicit in code and annotations; running this helper is optional.
- [x] Add a real React example with stable promises, `use`, and a Suspense boundary.
      Create/cache promises outside rendering and resolve them with a control so
      the demonstration does not depend on network timing.
- [x] From the same already-revealed initial content, compare an urgent resource
      change with one made inside a Transition.
- [x] Provide Reset and Resolve controls for the real React example. Include rejection as a small supported
      path with an error boundary, without expanding the main walkthrough.

Acceptance: demonstrate initial fallback, urgent replacement fallback, retention
of revealed content during a pending Transition, and publication after resolution.
The toy boundary must not resurrect hidden historical content after fallback was
already shown. Rejection reaches error handling; it is not treated as content.

Explain that suspension is resource waiting, while cooperative yielding concerns
CPU work. The thrown-thenable helper is educational; it is not a production data
source integration. React additionally handles boundary stacks, lanes, hidden
trees, and commit/retry policy.

### P6 — Record and explain the real React behavior

- [x] Capture equivalent ordinary-update and Transition runs of P4.
- [x] Capture a second input during transition work and the indivisible variant.
- [x] Capture P5 separately to distinguish resource waiting from CPU activity.
- [ ] Use React DevTools Profiler for committed component work, and browser
      Performance with React Performance Tracks for the broader timeline.
- [x] Save a presentation-ready recording and a concise annotated walkthrough.

Record browser/version, React/version, build mode, Strict Mode setting, workload,
throttling, and whether input was manual or scripted. Keep comparison settings
equivalent. Use a development or profiling build that exposes the required
tracks; verify the setup rather than assuming ordinary production exposes them.

Acceptance: the walkthrough points to actual evidence for urgent work, background
rendering, interruption where observed, and final publication. Correlate host
callbacks with React activity before attributing them to React. Distinguish
render, commit, layout, and paint; commit counts alone do not establish abandonment.

If a recording tool is unavailable, provide exact capture steps and mark the
recording deliverable pending. Never substitute toy logs or a schematic and
describe it as captured React behavior.

### P7 — Write presentation text and rehearse

- [x] Write approximately 18–22 slides in Markdown after model walkthroughs have
      been reviewed, real React examples are working, and relevant recordings inspected.
- [x] Give each slide one takeaway, short on-screen text, speaker notes, and a
      demo cue or small snippet where useful.
- [x] Include readable implementation snippets for Scheduler, Fiber, and Suspense
      in the main story; keep longer versions in the guide for code navigation.
- [x] Put source links, implementation qualifications, and recording context in
      notes. Mark expected scenarios separately from measured observations.
- [ ] Rehearse the sequence, including resets, code navigation, and opening the
      saved recording if live profiling is inconvenient.

Suggested 20-slide storyline:

1. The input responsiveness problem.
2. The JavaScript execution constraint.
3. Tasks and microtasks.
4. Cooperative scheduler demo.
5. Why Fiber stores work explicitly.
6. Step through the tiny Fiber tree.
7. Current output, draft output, and publication.
8. Urgent work and transition work.
9. Two toy lanes.
10. Queue rebasing: 1 → 2 → 23.
11. Real React search baseline.
12. Add a Transition and explain the results bailout.
13. Read the recorded scheduling timeline.
14. One long function exposes the yielding limit.
15. Introduce Suspense through a pending resource.
16. Boundary handling, notification, and retry.
17. Real React: urgent versus Transition suspension.
18. Render, commit, and browser costs.
19. Practical takeaways and common misconceptions.
20. References and questions.

Acceptance: slide claims match the finished code and recordings; the main story
fits the planned duration. The existing integrated miniature can be an optional
backup walkthrough rather than an additional required teaching unit.

## Verification and completion

For each unit, document the question, classification, code walkthrough, expected
observations, explanation, source mapping, and deliberate simplifications. Add
run steps and reset behavior for runnable examples.
Use controlled clocks/queues for meaningful model invariants and browser rehearsal
for interactive behavior. Reuse existing checks; do not build a large test harness
for this collection or assert exact browser timings.

Review pseudocode for correct control flow and state transitions even when it is
not executed. Mark execution as not performed where applicable; this does not
block completion of a model intended for a code walkthrough. Actual execution
and recordings remain required for the real React profiling demonstrations.

A stage is complete only after its acceptance criteria are checked. Mark its
checkboxes and record actual artifact paths and verification results. Report
specific remaining gaps without claiming they passed. The collection is complete
when all five units, the recordings/walkthrough, and slide text are ready to use.

## Implementation record — 23 September 2026

- Host: `demos/main.jsx`, exact React/React DOM 19.3.0; development, production
  and profiling commands in `package.json`.
- Models: `demos/models/scheduler.mjs`, `fiber.mjs`, `queue.mjs`; Suspense reuses
  `examples/mechanisms.mjs`. `npm run models` executes all four walkthroughs.
- Real React: `demos/search.jsx` (ordinary/Transition/indivisible), and
  `demos/suspense.jsx` with stable controlled promises in `demos/resources.mjs`.
- [Demo guide](demo-guide.md), [20-slide text](community-call-slides.md), and
  [measured profiling walkthrough](profiling-walkthrough.md) are delivered.
- Five recorded browser traces and programmatic Profiler callback logs are in
  `evidence/community-call/`. The Transition trace explicitly contains an
  Interrupted Render event. These callback logs are not DevTools extension exports.
- `npm test`: 10 original checks and 5 model tests passed.
  `npm run models`, production/profiling builds, and the five-lesson Edge
  functional rehearsal passed. The expanded browser check also covers all three
  Scheduler modes and retained content after a pending Transition attempt.
- Prettier configuration, ignore rules, EditorConfig and Git line-ending rules
  are installed. Formatting excludes both immutable reference directories and
  captured evidence. The research document duplicates remain synchronized.
- Remaining manual work: React DevTools extension capture, interactive import of
  a saved Performance trace, manual typing on the presentation machine and full
  talk timing. Automation is not a substitute for those presenter steps.

## Accuracy follow-up — 10 October 2026

- [Accuracy review](accuracy-review.md) checks the teaching paths against pinned
  source and records caveats for the four suggested articles.
- `demos/models/suspense.mjs` now implements the phase-separated MiniSuspense;
  lesson 5 provides manual render/retry/commit and discard controls beside real React.
- Slide text now has 22 slides, adding requestIdleCallback comparison and separate
  Suspense notification/retry/commit. The guide and CLI walkthrough match the model.
- Verification: 10 original checks plus 9 model tests, all five lessons in Edge
  155.0.4283.45, both builds, formatting and 68 immutable reference hashes passed.
  September traces were re-extracted, not replaced; manual DevTools capture and
  complete presenter rehearsal remain pending.

## Deferred scope

Hydration, external stores, Activity, View Transitions, a dedicated large-DOM
benchmark, and a general integrated renderer are optional future work. Mention
relevant limitations briefly; do not implement these extensions in this plan.
A PowerPoint/Google Slides deck is optional; Markdown presentation text satisfies
the current presentation deliverable.

## Official documentation for implementation

Recheck the relevant documentation when implementing and keep source citations
pinned to the selected React revision:

- [startTransition](https://react.dev/reference/react/startTransition)
- [Suspense](https://react.dev/reference/react/Suspense)
- [use](https://react.dev/reference/react/use)
- [Profiler](https://react.dev/reference/react/Profiler)
- [React Performance Tracks](https://react.dev/reference/dev-tools/react-performance-tracks)

Preserve the audit's version-specific caveats when reference documentation and
the pinned release differ; do not flatten those differences into universal claims.
