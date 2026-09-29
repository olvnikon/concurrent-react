# Demo guide: Concurrent React

Five lessons, one small host. Lessons 1–3 are **educational reconstructions**;
lessons 4–5 use **real React 19.3.0**. Lesson 5 also exposes the small Suspense
model. Source panels show the actual teaching code, not a second implementation.

## Run and maintain

From the project root, with Node 22.12+ (verified with 22.17.1):

```sh
npm ci
npm run dev
```

Open the printed localhost URL (normally http://127.0.0.1:5173).
Use the sidebar in order. Development mode and Strict Mode off are displayed
explicitly. This setting keeps the comparison easier to narrate; it is not
advice to disable Strict Mode in applications.

```sh
npm test                  # 10 original checks + 5 isolated-model tests
npm run models            # runnable Scheduler/Fiber/queue/Suspense walkthrough
npm run test:browser       # scripted functional rehearsal, installed Edge
npm run build             # ordinary production build
npm run build:profiling   # production profiling build
npm run preview           # serve the most recently built output
npm run format            # format project code and Markdown
npm run format:check      # read-only formatting check
```

Both builds use `dist/`; building one replaces the other. Record in development
for the supplied walkthrough. Normal production is not the profiling build.
Tests/capture use port 5175 and installed Microsoft Edge, or a Chromium-based
browser specified with `BROWSER_EXECUTABLE_PATH`. No browser download is required
when Edge is present. The scripts close their own browser and server.

Prettier uses two spaces, single quotes, semicolons, trailing commas, a
100-character target, LF, and preserved Markdown prose wrapping. Its ignore file
excludes both React source folders, dependencies, build output, evidence, the
lockfile and immutable source metadata. Do not override those exclusions.

## 1. Cooperative Scheduler

**Question:** where can the browser regain control?
**Classification:** educational reconstruction.
**Code:** [scheduler.mjs](../demos/models/scheduler.mjs),
[UI](../demos/model-lessons.jsx).

1. Select “MessageChannel tasks,” 4 ms per unit; click **Run work**.
2. Tap **Tap while working**. Watch work slices and the frame-callback counter.
3. Repeat with **One blocking function** and **Microtask chain**.
4. **Reset** clears the run and taps; the frame counter is cumulative while this
   lesson is mounted. Leaving the lesson cancels its work.

Expected: the task version returns between slices. The other versions can delay
input handling and frame callbacks until their work finishes. On a fast machine,
repeat the interaction rather than asserting a particular frame count.

Walk the code in this order: `next` → one unit → budget check → `postTask(workLoop)`.
A callback must finish its current unit even if that unit overruns the budget.
The host helper queues a callback and posts one MessageChannel message to deliver
it. Its `postTask` name means an injected enqueue function, **not** the browser
`scheduler.postTask` API. The microtask variant substitutes `queueMicrotask`:
a fresh callback is not necessarily a fresh browser task.

`npm run models` uses a controlled clock: four 3 ms units produce two slices of
two units each under a 5 ms threshold. This is executed model output, not a
measurement of React. The browser UI uses actual deliberate busy work.

Simplifications: FIFO units, one run, no priority heaps, expiration, or root
scheduling. Diagnostic UI itself uses React; its updates add overhead. The
counter counts rAF callbacks, not paints. Returning control permits host work;
it does not guarantee input or paint after every slice.

Source: [Scheduler.js, shouldYieldToHost and host callback setup][scheduler].
The selected stable build has `enableThrottledScheduling = false` in
[ReactFeatureFlags.js][flags]; do not describe the alternative reconciler
budget branch as the active policy.

## 2. Fiber and publication

**Question:** how can work pause without showing unfinished output?
**Classification:** educational reconstruction.
**Code:** [fiber.mjs](../demos/models/fiber.mjs).

1. **Reset**. Current output says “Previously committed UI.”
2. **Step one unit** through App, Input, Results, Row A, Row B.
3. Watch `next`, the begin/complete log, and draft output. Current stays unchanged.
4. **Discard draft**: current stays unchanged.
5. **Reset → Finish draft → Publish**: the completed list becomes current.

Begin order is App → Input → Results → Row A → Row B. Completing Row B also
completes Results and App. Thus a unit may unwind multiple ancestors; it is not
“exactly one tiny function per checkpoint.” Publishing an unfinished draft throws.

The list is a stand-in for host output, not a second DOM renderer. Pausing retains
a pointer; discarding drops the draft; publication copies the completed list.
Showing the draft in the diagnostic panel is not partial publication of the
modeled UI. Real React reuses alternate Fibers, reconciles children, tracks flags,
and performs commit work. The toy does none of those.

Source: [ReactFiber.js, createWorkInProgress][fiber];
[ReactFiberWorkLoop.js, performUnitOfWork and completeUnitOfWork][work-loop].
`npm run models` prints the full traversal; deterministic tests cover early
publication, discard isolation, and the finished output.

## 3. Lanes and rebasing

**Question:** how can urgent work skip updates without losing insertion order?
**Classification:** educational reconstruction.
**Code:** [queue.mjs](../demos/models/queue.mjs); its source panel shows
`processQueue` from the [existing engine](../examples/mini-concurrent-react.mjs).

Click **Process urgent lane**, then **Process transition lane**; **Reset** repeats.

| Phase   | Calculation                                               | Published state |
| ------- | --------------------------------------------------------- | --------------- |
| Initial | Base = 1; queued +10 transition, ×2 urgent, +1 transition | 1               |
| Urgent  | Skip +10; apply ×2; skip +1                               | 2               |
| Replay  | Saved base 1 → +10 = 11 → ×2 = 22 → +1 = 23               | 23              |

At the first skip, save the state before it. Retain that skipped update and the
following updates needed for ordered replay. The urgent update's replay copy has
`NoLane`, so it can run when reconstructing state later. Starting the replay at
the urgent result would be wrong. Calculating ×2 again does not publish it twice.

Simplifications: two lane bits, one queue, no per-hook queues, entanglement,
expiration, optimistic updates, or root selection. A lane is an update grouping,
not a separate thread or necessarily one Scheduler priority.

Source: [ReactFiberHooks.js, updateReducerImpl][hooks]. Both suites check the
noncommutative 1 → 2 → 23 result. The model is also executable via `npm run models`.

## 4. Real React search and profiling

**Question:** what changes when expensive results become a Transition?
**Classification:** real React.
**Code:** [search.jsx](../demos/search.jsx), [profiling.mjs](../demos/profiling.mjs).

1. Choose **Ordinary updates**, **120 small components**, **2 ms**. Reset.
2. Type `a` and quickly `b`. The deliberately expensive results delay the update.
3. Choose **Transition**, keeping the other settings identical. Reset and repeat.
4. Observe urgent input and temporarily older results. Then results catch up.
5. Keep Transition; switch to **One indivisible call**, reset, and repeat.

`setInput` stays urgent. `startTransition(() => setQuery(value))` marks the results
update. The callback itself runs immediately; expensive work belongs to render.
`memo(SlowResults)` lets the urgent pass skip that subtree when its props are
unchanged. It does not make a changed-query render cheap.

Rows distribute the cost across component calls. The other variant puts the same
nominal cost into one `SlowResults` call, which React cannot interrupt. The exact
timings differ with machine, instrumentation, and scheduling; tune 1/2/4 ms before
the call. Mode/workload changes remount the example; **Reset** clears the query.

Simplifications: synthetic CPU work, fixed rows, no network, virtualization or
React Compiler. This isolates scheduling, not a recommended slow-search design.
“Results are catching up” compares input/query; it is not a general `isPending`
implementation. The commit diagnostics update only when explicitly read.

Use [the profiling walkthrough](profiling-walkthrough.md) for measured traces,
DevTools steps and limitations. Ordinary vs Transition both publish the same final
query. Interruption is established by the saved React track, not by commit counts.

Source: [startTransition documentation][transition-docs],
[workLoopConcurrentByScheduler / performUnitOfWork][work-loop].

## 5. Suspense and retry

**Question:** what does a boundary show when the next resource is pending?
**Classification:** real React plus a separately labeled educational model.
**Code:** [suspense.jsx](../demos/suspense.jsx),
[resources.mjs](../demos/resources.mjs),
[createResource / createBoundary](../examples/mechanisms.mjs).

1. **Reset to pending mount**: fallback is visible; **Resolve resource** reveals A.
2. **Reset to revealed A**, choose **Urgent**, then **Load Article B**:
   fallback replaces A while B is pending. Resolve reveals B.
3. Reset to revealed A, choose **Transition**, then load B:
   A remains visible with a pending message. Resolve reveals B.
4. Optional: repeat and **Reject resource**. The error boundary shows the error.
   Reset starts a fresh boundary/scenario.

The real example creates a stable promise outside rendering and calls
`use(request.promise)` in Article. The controls settle that same promise once.
No real HTTP request or cache integration is implied.

For the miniature, open its first source panel and follow:

1. `createResource` records pending/fulfilled/rejected status.
2. `read()` throws the stable wakeable while pending, returns fulfilled data,
   or throws the rejection reason.
3. `createBoundary` catches only thenables, registers one retry listener,
   and chooses fallback or currently revealed content.
4. Settlement updates the resource, then schedules retry.
5. Retry calls render again; success is published immediately in this toy.

`npm run models` actually executes “Loading” followed by “Ready.” Existing tests
also cover retained content, listener deduplication and not resurrecting old
content once fallback has replaced it. The real browser test checks rejection.

The helper is **not a supported production data-fetching API**. It combines
successful render/publication, whereas React separates render, boundary unwind,
ping/retry scheduling and commit. React also handles hidden trees, lanes, multiple
boundaries, and fallback throttling. Do not teach a thrown promise as CPU yielding
or the waiting interval as CPU time. Production promises should come from a
suitable framework/cache integration rather than new promises in render.

Source: [use][use-docs], [Suspense][suspense-docs],
[ReactFiberWorkLoop.js, attachPingListener / pingSuspendedRoot][ping],
[ReactFiberSuspenseContext.js][boundary-context].

## Rehearsal and verification boundaries

Automated Edge rehearsal covers the five lessons, resets/discard/publication,
final search output, urgent fallback, Transition retention, pending mount and
rejection. Five real React browser traces were captured and their events inspected.
The search screenshot was visually reviewed; not every viewport was visually
reviewed. Model tests and builds are separate evidence, not substitutes for browser
behavior.

Still do a human rehearsal on the presentation machine: select/reset each lesson,
open its code panel, type manually, capture with the DevTools extension, and load a
saved Performance trace. The extension profile export and full live talk timing
have **not** been verified. If live typing fails to show interruption, use the
saved trace and describe its recorded settings, rather than inventing an event.

[Slide text](community-call-slides.md) follows this order. Budget about 60–75
minutes including demo transitions, with questions afterward; this is proposed
pacing, not a measured rehearsal duration.

## Pinned source map

All source links below use commit `1d34f91dfde6bba84d08b683aaba164c7194dacb`
(React 19.3.0). They refer to the immutable snapshot, not the separate clone's HEAD.
Teaching snippets are original reconstructions; upstream files retain their license.

[scheduler]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/src/forks/Scheduler.js#L459
[flags]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/shared/ReactFeatureFlags.js#L76
[fiber]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiber.js#L323
[work-loop]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L3073
[hooks]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L1316
[ping]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L4970
[boundary-context]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberSuspenseContext.js#L22
[transition-docs]: https://react.dev/reference/react/startTransition
[use-docs]: https://react.dev/reference/react/use
[suspense-docs]: https://react.dev/reference/react/Suspense
