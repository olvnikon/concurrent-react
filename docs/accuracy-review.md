# Code and slide accuracy review — 10 October 2026

Scope: the five lesson-host demos, their small models, the original engine's
behavioral checks, presenter guide, slide text, and claims relevant to the four
suggested articles. This is not a verification of every React feature or every
historical paragraph in the research dossier.

## Outcome and changes

The existing Scheduler, Fiber, rebasing and real React examples agree with the
source paths reviewed below, within their documented simplifications. Their
behavioral checks passed before changes. No change to the original engine was
needed. The missing pieces were in the teaching presentation:

- `requestIdleCallback` was accurately described as **not** the default driver
  in the research documents, but omitted from the slide script. Slide **03a** now
  compares host APIs and provides an idle-callback illustration.
- The old `createBoundary` helper combined successful render and publication;
  the lesson only showed its code. The new runnable
  [MiniSuspense](../demos/models/suspense.mjs) explicitly separates render,
  capture/retention, notification, retry and commit. Its controls are in lesson 5.
- Slides **16/16a** and the [demo guide](demo-guide.md#5-suspense-and-retry)
  explain the model and bridge it to renderer-owned React Suspense. `use` uses
  an internal exception protocol; our raw thrown wakeable is not a public API.
- Notes distinguish Scheduler callbacks from reconciler Fiber traversal, and
  avoid treating passive effects as unconditionally after-paint work.

## Primary-source checks

Baseline: React **19.3.0**, commit
`1d34f91dfde6bba84d08b683aaba164c7194dacb`, as recorded in `source-manifest.json`.
All 68 immutable snapshot hashes were checked. The separate read-only clone's
HEAD is `d083ec1da1e5252abd3ddfdde6dfbc09701a2c51`; it is not our citation baseline.
Neither reference directory was modified. All models remain original teaching code.

| Question                                | Verified source and symbol                                                                                  | Teaching boundary                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| How is later work delivered?            | [Scheduler.js, host setup][host]                                                                            | Default preference: setImmediate, MessageChannel, timer; no requestIdleCallback or automatic postTask selection. |
| Who yields and traverses?               | [Scheduler.js, workLoop][scheduler-loop]; [ReactFiberWorkLoop.js, workLoopConcurrentByScheduler][work-loop] | Scheduler invokes callbacks; reconciler traverses Fibers. A threshold cannot interrupt an active function.       |
| How does urgent root work get arranged? | [ReactFiberRootScheduler.js, scheduleImmediateRootScheduleTask][root]                                       | Root microtask scheduling and Scheduler host tasks are distinct.                                                 |
| How many alternates?                    | [ReactFiber.js, createWorkInProgress][fiber]                                                                | Double buffering, not a separate WIP Fiber for every lane. Our fixed-tree model omits reconciliation.            |
| Why replay urgent updates?              | [ReactFiberHooks.js, updateReducerImpl][hooks]                                                              | Saved base state and replay copies preserve order; our two bits are not React constants.                         |
| How is suspension captured?             | [handleThrow][handle-throw], [throwException][throw], [updateSuspenseComponent][boundary]                   | Real React retrieves a thenable and uses boundary/Fiber state; the toy invokes a child function synchronously.   |
| What does settlement do?                | [attachPingListener / pingSuspendedRoot][ping]; [attachSuspenseRetryListeners][retry]                       | Root ping and committed-boundary retry are separate paths; the toy collapses their scheduling into one callback. |

Public behavior was also checked against the official
[startTransition](https://react.dev/reference/react/startTransition),
[Suspense](https://react.dev/reference/react/Suspense),
[use](https://react.dev/reference/react/use) and
[useEffect](https://react.dev/reference/react/useEffect) documentation.
The idle API illustration follows the
[requestIdleCallback specification](https://w3c.github.io/requestidlecallback/).

## Suggested articles: useful leads, not implementation authority

These are focused caveats, not exhaustive article reviews. The corrections are
grounded in the primary sources above; none of the disputed examples was adopted.

### DEV: Scheduler and Fiber architecture

The [DEV article](https://dev.to/yorgie7/react-scheduler-fiber-architecture-explained-time-slicing-concurrent-rendering-wip-management-3knh)
contains several misleading claims: parallel rendering on the main thread,
requestIdleCallback as the scheduling driver, Scheduler walking Fibers, multiple
WIPs per Fiber for different lanes, and passive effects always running after paint.
Do not use those statements in the talk. Concurrency is cooperative interleaving;
current/alternate Fibers and lane selection are different concepts.

### Plain English: Scheduler deep dive

The [Plain English article](https://javascript.plainenglish.io/how-react-scheduler-works-internally-deep-dive-2025-edition-850fdd38bc10)
has useful host-driver and heap explanations, but some examples do not establish
what their commentary claims. Wrapping a CPU-heavy component in Suspense does not
make its calculation suspend. `expensiveSearch` inside a startTransition callback
still runs immediately and blocks; only the state update is marked. The later
setter in `fetchAnalytics().then(setAnalyticsData)` is not marked just because
fetching began inside startTransition. Scheduler priority timeouts are expiration
thresholds, not exact execution guarantees. Yielding permits, but does not
guarantee, paint/input between slices. The article also conflates individual
setters with Scheduler tasks; root scheduling and batching intervene.

### DeepWiki: Scheduler

The [DeepWiki page](https://deepwiki.com/react/react/5-scheduler) is a useful
source-navigation aid, but its index is based on a different revision (`2860e0`).
Its broad postTask description must be qualified by the selected fork: the
stable default does not automatically switch to it. ImmediatePriority on a
scheduled callback means an already-expired task, not synchronously invoking
the callback inside `unstable_scheduleCallback`. Some citations use Meta-specific
feature flags; use the stable open-source flags for this talk.

### LogRocket: React Fiber

The [LogRocket article](https://blog.logrocket.com/deep-dive-react-fiber/) mixes
historical source walkthroughs with modern API explanations. Its older account
of pausing a running unit, showing whatever partial work has finished, and
resuming on the next 16 ms frame is not our baseline's behavior. React checks
between units, keeps uncommitted output private, and is not frame-aligned. Also,
a node's own completion does not wait for its following sibling to complete:
completion precedes moving to that sibling. Treat old fields/APIs as historical,
and use the pinned source for current control flow.

## Verification and limits

- `npm test`: 10 original behavioral checks plus 9 isolated-model tests passed.
- `npm run models`: executed Scheduler, Fiber, rebasing and separated Suspense phases.
- Production and production-profiling builds passed.
- `npm run test:browser`: all five lessons passed in headless Edge 155.0.4283.45,
  React 19.3.0 development, Strict Mode off, no CPU throttling. Scripted controls
  verified model discard, notification/retry/commit, retention and rejection,
  plus the existing real React scenarios. The expected caught rejection logs
  a development error; there were no uncaught page errors.
- `npm run format:check` and `git diff --check` passed. The two research-document
  duplicates remain identical; slide count and upstream link ranges were checked.
- All 68 reference hashes passed; the source directories remain read-only.
- Historical trace data was re-extracted: the slide's interruption timestamps,
  indivisible-task durations and Suspense waiting span agree with the saved data.
  These are September recordings, not new measurements of the changed lesson UI.

A manual React DevTools extension export and full presenter rehearsal remain
outside the completed checks. Neither model logs nor Profiler commit counts
alone establish real React interruption.

[host]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/src/forks/Scheduler.js#L530-L561
[scheduler-loop]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/src/forks/Scheduler.js#L193-L259
[work-loop]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L3073-L3106
[root]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberRootScheduler.js#L650-L714
[fiber]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiber.js#L323-L360
[hooks]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L1316-L1510
[handle-throw]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L2302-L2369
[throw]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberThrow.js#L364-L485
[boundary]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberBeginWork.js#L2383-L2427
[ping]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L4970-L5091
[retry]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberCommitWork.js#L1978-L2012
