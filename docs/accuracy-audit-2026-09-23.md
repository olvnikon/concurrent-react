# Concurrent React accuracy audit

Reviewed 23 September 2026. The initial review left existing files unchanged.
This report also records the subsequent corrections to teaching code and docs;
both upstream source directories remain read-only references.

## Verdict

The main research is grounded in the pinned React source, not an invented
implementation. The initial review found four code/example issues and one
misleading artifact reference. All five were corrected in the follow-up described
below; the original findings remain in this report so the reasoning is preserved.

The runnable renderer is an educational reconstruction, not React. Its tests
and browser events do not establish production React behavior. The README and
dossier generally make this distinction well; preserve it in slides and demos.

## Follow-up corrections applied

The follow-up kept the mechanisms intentionally small:

- Manual input now cancels the scripted replay, clears its pending input timer,
  and re-enables its button. Controlled timer checks cover cancellation before
  the first scripted input and after a yield has queued the second input.
- The boundary helper tracks one extra fact—whether this toy boundary is
  currently showing fallback—so a transition cannot resurrect old content.
  Documentation explicitly says this boolean stands in for richer React state.
- Scheduler pseudocode uses a tiny FIFO and one-outstanding-host-task guard.
- Suspense pseudocode rethrows ordinary errors and retries on fulfillment or
  rejection.
- The DOM-publication comparison is labeled **proposed / not implemented**.

The suite now contains **10** behavioral checks. Headless Edge regression testing
confirmed that input during replay settles at the user's value with the button
enabled, and that a subsequent replay still reaches `ab` with 120 rows and no
page errors.

## Baseline and scope

- Research baseline: React **19.3.0**, tag `v19.3.0`, commit
  `1d34f91dfde6bba84d08b683aaba164c7194dacb`.
- The release/version claims agree with the official
  [React versions page](https://react.dev/versions),
  [19.3 release announcement](https://react.dev/blog/2026/09/09/react-19-3),
  and [release entry](https://github.com/react/react/releases/tag/v19.3.0).
- The local clone's `v19.3.0` tag resolves to the research commit. All **68**
  snapshot files match both their manifest SHA-256 hashes and the bytes retrieved
  from that commit in the clone. This is stronger than checking the manifest alone.
- The clone's current HEAD is
  `d083ec1da1e5252abd3ddfdde6dfbc09701a2c51`, not the research commit. Do not mix
  snippets from HEAD with claims about the pinned release without checking them.
- Reviewed the README, root dossier/context pack, their `docs/` copies, talk
  outline, setup assessment, project instructions and skills, three example
  modules, standalone HTML, source metadata, and relevant pinned implementation
  paths/feature flags. Compared public claims with current official React docs.
- Both root/document copies are byte-identical. The HTML's embedded engine
  matches the module; the dossier also contains that engine. All **79** recorded
  source-reference ranges are within their target files.

## Original findings (resolved)

### 1. Replay can remain disabled after the user interrupts it

Location: [mini-concurrent-react-demo.html:301](C:/Work/concurrent-react/mini-concurrent-react-demo.html:301).

Replay ownership is released only when a commit's query equals `ab`. If that
candidate is superseded by typing another value, `ab` need never commit. The
renderer finishes correctly, but `scripted` remains true and the replay button
stays disabled. Clearing the trace does not reset it.

Reproduced in headless Edge: start the replay with 3 ms rows; after the scripted
input reaches `ab`, while its draft is rendering, enter `xyz`. Observed final
query `xyz`, zero pending lanes, and a disabled replay button.

Recommended correction: cancel or complete replay ownership when interactive
input supersedes the script, with a regression check for this sequence. This is
a demo-control bug, not evidence of a React scheduling problem.

### 2. The Suspense helper confuses historical content with currently visible content

Location: [examples/mechanisms.mjs:32](C:/Work/concurrent-react/examples/mechanisms.mjs:32),
also reproduced in the [dossier:827](C:/Work/concurrent-react/concurrent-react-research-dossier.md:827)
and its `docs/` copy.

`hasContent` becomes true after any successful render and never changes when the
helper publishes a fallback. This sequence exposes the problem:

1. Successful render returns `old`.
2. An urgent pending render returns `fallback`.
3. A Transition render of the same still-pending resource returns `old` again.

The helper reproduced `old → fallback → old`. React distinguishes a boundary
currently showing primary content from one already showing its fallback; it does
not use only an "ever rendered successfully" flag. See the pinned
[`pushPrimaryTreeSuspenseHandler`][suspense-context] and
[`updateSuspenseComponent`][suspense-update], together with the official
[Suspense caveats](https://react.dev/reference/react/Suspense).

The helper is already labeled teaching-only and assumes immediate commit after
success. Those disclosed simplifications are acceptable, but this additional
state-transition limitation should be corrected or explicitly excluded from
the lesson. Track the currently published boundary state, or reset/restrict the
model between scenarios. The React comparison here is source-based; this exact
sequence was not run against a real React app in this audit.

### 3. The outline's scheduler sketch overwrites pending callbacks

Location: [talk outline:360](C:/Work/concurrent-react/docs/concurrent-react-deep-talk-topics.md:360).

The sketch stores every callback in one `scheduledCallback` variable and posts
a message for every call. Scheduling callback A and then B before delivery runs
B twice and loses A. A controlled host-message reproduction produced `[2, 2]`
instead of `[1, 2]`. The variable's declaration is also omitted from the sketch.

This is fine only as an explicitly constrained illustration of a host wake-up,
not a general `schedule(callback)` implementation. React keeps scheduled work
in task queues; a host message drives the work loop. The existing runnable
`createScheduler` already has a queue and does not share this sketch's defect.
See the pinned [Scheduler implementation][scheduler].

Recommended correction: show a small queue, or explicitly model one coalesced
host callback with its one-outstanding-callback invariant.

### 4. The outline's Suspense sketch swallows errors and omits rejection retry

Location: [talk outline:874](C:/Work/concurrent-react/docs/concurrent-react-deep-talk-topics.md:874).

The `catch` handles thenables but silently consumes ordinary errors. It also
calls `thing.then(scheduleRetry)` without a rejection callback. Executing the
snippet confirmed an ordinary error did not propagate and only one settlement
handler was registered. A rejected resource can therefore bypass the intended
retry/error-rendering path.

React's [`attachPingListener`][ping] registers notification for both fulfillment
and rejection; rejection is not successful content. The local `createBoundary`
helper already rethrows non-thenables and registers both callbacks, so the
outline should agree with it. The official
[`use` reference](https://react.dev/reference/react/use) explains the distinction
between suspension and rejected-promise error handling.

Recommended correction: rethrow non-thenables and notify on both settlement
paths, or label the snippet narrowly as an incomplete pending-success sketch.
Keep the existing warning that manual promise throwing is not a supported
production data-fetching integration.

### 5. A proposed demo is described as an existing supplied artifact

Location: [talk outline:823](C:/Work/concurrent-react/docs/concurrent-react-deep-talk-topics.md:823).

The instruction to use Astra's "cheap render, huge DOM publication" example
suggests a runnable artifact exists. No dedicated implementation of that demo
was found. The dossier correctly lists it as an experiment design, along with
the proposed real-React examples. The miniature's DOM adapter is not a complete
controlled comparison for this lesson.

Recommended correction: mark the commit-bottleneck demo as **proposed / not yet
implemented**, and inventory other proposed demos separately from runnable
files. The repository currently has neither a real React app nor an integrated
Fiber-plus-Suspense demo; `mechanisms.mjs` supplies a separate boundary helper.

## Important claims that checked out

| Topic | Audit result and qualification |
| --- | --- |
| Fiber and yielding | The source supports linked work units, current/alternate reuse, interruption, and discarded speculative output. A running component call is not preempted. The work loop and enabled feature flags support the dossier's qualifications. |
| Scheduler and lanes | Host tasks, scheduling microtasks, Scheduler priorities, and lanes are correctly distinguished in the detailed research. The 5 ms budget is a cooperative threshold, not a hard limit or guaranteed paint cadence. Real Scheduler queues are not the miniature's FIFO algorithm. |
| Transitions and rebasing | Immediate `startTransition` callback execution, urgent controlled input, skipped updates, and ordered replay are supported. The noncommutative queue example reaches urgent state 2 and eventual state 23. See [`updateReducerImpl`][hook-queue] and the [public Transition reference](https://react.dev/reference/react/startTransition). |
| Suspense | Pending resources, capture, notification, retry, and publication are correctly separated in the detailed research. `use`'s internal suspension sentinel is distinguished from the educational raw-thenable model. The boundary-state defect above is a specific exception. |
| Commit and effects | The dossier correctly distinguishes ordinary synchronous publication from resource/View Transition orchestration and does not promise passive effects always run after paint. Preserve those qualifications when shortening slides; see [commit orchestration][commit] and [DOM View Transition integration][view-transition]. |
| Deferred values and external stores | The explanations match deferred-value lane selection and store consistency checks, including synchronous recovery from inconsistent snapshots. These are not generic debounce or automatic background-thread mechanisms. |
| Public versus internal APIs | The pinned stable exports and feature flags support the release-specific Activity/View Transition discussion. Internal Offscreen machinery and experimental exports are not treated as interchangeable stable APIs. |
| Profiling | The proposed pairing of a commit-focused Profiler with browser/React Performance Tracks is sound. Tracks require supported development/profiling instrumentation; toy User Timing marks are not React tracks. See [Performance Tracks](https://react.dev/reference/dev-tools/react-performance-tracks) and [Profiler](https://react.dev/reference/react/Profiler). |

### An upstream documentation discrepancy to preserve explicitly

The current [`startTransition` page](https://react.dev/reference/react/startTransition)
still includes a blanket statement about batching multiple ongoing Transitions.
The [19.3 release notes](https://react.dev/blog/2026/09/09/react-19-3) and enabled
`enableParallelTransitions` source flag describe independently progressing
Transitions. The dossier already calls out this discrepancy rather than hiding it.

Do not replace it with "all Transitions are independent": same-event allocation,
shared hook queues, and async-action entanglement still matter. In particular,
[`entangleTransitionUpdate`][entanglement] connects pending transition lanes in
the same hook queue. Treat the release/source interpretation as version-specific
and disclose the reference-page mismatch in presenter notes if covering this topic.

## Initial audit verification

| Check | Result |
| --- | --- |
| Existing `node examples/verify.mjs` suite | **9 checks passed**, rerun during this audit. |
| Module and embedded-engine syntax | Passed. |
| Snapshot provenance/integrity | **68/68** manifest hashes and pinned Git file contents matched. |
| Source-reference bounds | **79/79** ranges valid. Bounds alone do not prove a claim; relevant implementations were also read. |
| Duplicated artifacts | Root/docs research copies and embedded/module engine agree. |
| Additional queue stress check | **100 deterministic seeds**, each with 30 mixed Sync/Transition noncommutative updates and varied host/microtask interleavings, matched an enqueue-order final-state oracle. |
| Browser replay | Passed at 0.5, 1, and 3 ms row workloads, and with a 100 ms first-row block. Each settled at input/query `ab` and 120 result rows; each observed one abandoned draft. |
| Browser input | Automated browser input settled correctly; no page errors observed in the normal replay/input checks. This was not a human typing rehearsal. |
| Targeted edge cases | Reproduced the stuck replay button, boundary historical-content issue, dropped scheduler callback, and swallowed outline error described above. |

Browser environment: headless Microsoft Edge **153.0.4234.48**, 1440 × 1100
viewport, no CPU throttling, standalone local HTML. React version/build and
Strict Mode: **not applicable**, because the page does not load React.

Observed first transition slices were approximately 5.3, 5.1, and 6.2 ms at the
three ordinary workloads, versus 100.1 ms with the indivisible first row. These
are observations of this model in one environment, not timing guarantees,
React benchmarks, or measured paint intervals.

## Limits and handoff

- No real React app, upstream React test suite, DevTools profile, or browser
  Performance recording was run/captured. Browser checks examined execution,
  emitted model events, and DOM results; screenshot layout was not visually
  inspected. Server rendering/hydration discussion was source/doc reviewed,
  not exercised in an application.
- The original nine tests did not cover the identified boundary edge case; the
  tenth check now does. The replay cancellation has a browser regression run.
  Passing these checks is still not a complete correctness proof.
- `package.json` still contains a placeholder test script. Use
  `node examples/verify.mjs`, not `npm test`, for the existing checks.
- Older README/setup statements about browser verification describe the earlier
  assessment. This report adds runtime/DOM evidence; it does not retroactively
  turn those historical checks into real React or visual-layout verification.
- Both upstream directories were left unchanged; the clone's working tree
  remained clean. The follow-up changed only the teaching artifacts and their
  accompanying project documentation listed in this report.

Recommended next step: build the new examples against an explicitly chosen
React runtime. Keep **public behavior**, **pinned internals**, **toy behavior**,
and **proposed experiments** labeled separately throughout the call.

[scheduler]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/src/forks/Scheduler.js
[suspense-context]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberSuspenseContext.js#L43-L116
[suspense-update]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberBeginWork.js#L2383-L2647
[ping]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L4970-L5096
[hook-queue]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L1316-L1588
[commit]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L3725-L3921
[view-transition]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js#L2167-L2421
[entanglement]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L3867-L3889
