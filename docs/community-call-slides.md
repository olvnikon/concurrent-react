# Concurrent React: from work units to visible UI

Presenter text, 22 slides (03a and 16a are companion slides). Proposed pacing:
60–75 minutes plus questions.
Keep “On screen” concise; “Speaker notes” are not slide body text.
Examples: React 19.3.0; internal references pinned to
`1d34f91dfde6bba84d08b683aaba164c7194dacb`.
Run instructions: [demo guide](demo-guide.md).
Recording details and qualifications: [profiling walkthrough](profiling-walkthrough.md).

## 01 — The input should not wait for everything

**Takeaway:** different updates can have different urgency.

**On screen**

- Typing is immediate feedback.
- Results may take longer.
- Can we keep typing responsive without showing an unfinished result?

**Demo cue:** Search, ordinary mode, 120 components, 2 ms; reset and type `ab`.

**Speaker notes**

This is intentionally slow rendering, not a recommendation to do CPU-heavy work
in each row. We will keep output and workload comparable while changing update
priority. Avoid promising that concurrency makes the calculation faster.
Source: [startTransition][transition].

## 02 — JavaScript still runs to completion

**Takeaway:** a running function is not interruptible by React.

**On screen**

```js
// Educational illustration: one indivisible call.
while (performance.now() < deadline) {
  // The browser cannot handle another input here.
}
```

Concurrency is not another JavaScript thread.

**Demo cue:** Point to `spin` in [shared.jsx](../demos/shared.jsx); defer the
real React indivisible variant until slide 14.

**Speaker notes**

A call stack must return before queued browser work can proceed. React controls
when to begin another unit; it cannot pause halfway through arbitrary user code.
Neither a Transition callback nor a promise converts CPU work into parallel work.
Source: [HTML event loops][event-loop].

## 03 — A callback is not necessarily a new task

**Takeaway:** tasks and microtasks yield different opportunities.

**On screen**

```text
Task → microtask checkpoint → possible rendering → later task
```

- MessageChannel: schedule a later task.
- queueMicrotask: continue in the checkpoint.
- Returning control does not guarantee a paint.

**Demo cue:** Scheduler lesson; identify the injected `postTask` function.

**Speaker notes**

The toy name `postTask` does not refer to the browser scheduling API. Our default
uses MessageChannel. React's browser Scheduler host path has a similar purpose,
with environment-specific alternatives; it is not a universal mandate to use
MessageChannel in application code. A microtask chain can delay rendering/input.
Sources: [HTML event loops][event-loop], [Scheduler.js][scheduler].

## 03a — Why not requestIdleCallback?

**Takeaway:** scheduling later and waiting for idle time are different policies.

**On screen**

| API                     | What it asks the browser to do                            |
| ----------------------- | --------------------------------------------------------- |
| `queueMicrotask`        | Continue at the microtask checkpoint                      |
| `MessageChannel`        | Deliver another task                                      |
| `setTimeout`            | Queue a timer task when eligible                          |
| `requestAnimationFrame` | Run a callback in a rendering update                      |
| `requestIdleCallback`   | Run during an idle period, with a remaining-time estimate |

React's default browser Scheduler uses **MessageChannel**, not `requestIdleCallback`.

**Demo cue:** Show the Scheduler model's host helper. This is an API comparison,
not another mode of the React demo.

**Speaker notes**

Here is a browser API illustration, not React's implementation. Assume a finite
`units` array and `next = 0`; each unit must be small:

```js
function idleWork(deadline) {
  while (next < units.length && deadline.timeRemaining() > 0) {
    units[next++]();
  }
  if (next < units.length) requestIdleCallback(idleWork);
}
requestIdleCallback(idleWork);
```

Without a timeout, idle callbacks may wait indefinitely under load. A timeout
queues a callback even without idle time; it is not an exact execution deadline.
The remaining-time check is cooperative, not a way to interrupt a running unit.
React needs to schedule updates without waiting for an idle period. Its pinned
default host preference is `setImmediate` → `MessageChannel` → `setTimeout`;
ordinary browsers take the MessageChannel path. `scheduler/unstable_post_task`
is a separate entry/fork, not automatic detection of the browser API.
Sources: [idle callback specification][idle], [Scheduler host setup][scheduler-host].

## 04 — A minimal cooperative Scheduler

**Takeaway:** save where work stopped, then schedule a continuation.

**On screen**

Educational reconstruction — core of [scheduler.mjs](../demos/models/scheduler.mjs):

```js
function workLoop() {
  const deadline = now() + budgetMs;
  do {
    units[next++]();
  } while (next < units.length && now() < deadline);

  if (next < units.length) postTask(workLoop);
}
postTask(workLoop);
```

**Demo cue:** Compare tasks, blocking, microtasks; use 4 ms and tap while working.

**Speaker notes**

This slide excerpt assumes a nonempty queue; the runnable version also handles
empty queues, cancellation and completion callbacks. The 5 ms threshold is checked
between units, not enforced inside them. A unit can overrun it. The frame counter
counts animation callbacks, not paints. React additionally uses priorities and
expiration; this toy does not. Source: [Scheduler.js, shouldYieldToHost][scheduler].
Keep the ownership clear: root scheduling selects pending lanes and arranges work;
Scheduler runs callbacks; the reconciler callback traverses Fibers and checks
whether to yield. Scheduler itself does not walk the component tree. Sync work
also has a root-scheduling microtask path; not every update waits for MessageChannel.
Allow roughly 8 minutes for slides 2–4.

## 05 — Fiber makes the traversal explicit

**Takeaway:** React needs to retain progress outside the JavaScript call stack.

**On screen**

Educational model:

```js
const fiber = {
  name,
  child: null,
  sibling: null,
  return: null,
};
const draft = { next: root, output: [], events: [] };
```

**Demo cue:** Open [fiber.mjs](../demos/models/fiber.mjs), then the Fiber lesson.

**Speaker notes**

These links are a small subset of a Fiber, not its complete structure. Real
Fibers also hold pending/memoized inputs, lanes, flags, state and alternate links.
We use a fixed tree and a list output so the traversal is visible without building
a reconciler. Source: [ReactFiber.js, createWorkInProgress][fiber].

## 06 — Begin downward, complete upward

**Takeaway:** traversal can resume from the next work unit.

**On screen**

Educational reconstruction — next-unit selection:

```js
if (unit.child) return unit.child;
while (unit) {
  complete(unit);
  if (unit.sibling) return unit.sibling;
  unit = unit.return;
}
return null;
```

**Demo cue:** Step App → Input → Results → Row A → Row B. Follow the completion log.

**Speaker notes**

This is a compact pseudocode view of the runnable model's traversal; `complete`
means recording completion here, not executing a hidden full renderer.
Completing a leaf may also complete several ancestors before a checkpoint.
Real begin/complete work may produce or reuse child Fibers and prepare host work.
Source: [performUnitOfWork / completeUnitOfWork][work-loop].

## 07 — A draft is not the visible UI

**Takeaway:** interruption can discard a candidate without exposing its partial result.

**On screen**

```text
Current output ────────────────────── stays visible
Draft: step → step → finish → publish
                   ↘ discard
```

**Demo cue:** Step twice, discard; current stays. Reset, finish, publish.

**Speaker notes**

The draft panel is teaching instrumentation, not partially published example UI.
Our publish operation copies a list. Real React commits host mutations and other
effects; it is not a second renderer running alongside this model.
Render output can be abandoned while update intent remains queued.
Sources: [createWorkInProgress][fiber], [work loop][work-loop].
Allow roughly 8 minutes for slides 5–7.

## 08 — Mark the update, not the calculation

**Takeaway:** urgent input and less urgent results can be separate state updates.

**On screen**

Real React, from the input handler:

```jsx
setInput(value);
startTransition(() => setQuery(value));
```

**Demo cue:** Show `change` in [search.jsx](../demos/search.jsx); run comparison later.

**Speaker notes**

The callback runs immediately. React marks the update; it does not postpone the
callback's arbitrary computation. Keep controlled input state urgent. This
lesson uses synchronous updates inside the callback and does not attempt to teach
all asynchronous Action semantics. Source: [startTransition][transition].

## 09 — Two bits are enough to explain selection

**Takeaway:** lane membership lets a render select some queued updates.

**On screen**

Educational lanes, not React's numeric constants:

```js
const SyncLane = 0b01;
const TransitionLane = 0b10;
const NoLane = 0; // replay copy
```

A lane is not a thread.

**Demo cue:** Open the queue source panel; locate the lane membership check.

**Speaker notes**

The full source panel shows the actual `processQueue`, not only the wrapper
`rebaseExample`. React has many lanes, per-hook queues, root scheduling and
entanglement. Lane selection and Scheduler callback priority are related but
not interchangeable concepts. Source: [updateReducerImpl][hooks].

## 10 — Skipping is not forgetting

**Takeaway:** replay from the saved base preserves insertion order.

**On screen**

| Pass         | Calculation      | Result |
| ------------ | ---------------- | ------ |
| Urgent       | 1 × 2            | 2      |
| Later replay | (1 + 10) × 2 + 1 | 23     |

Queue order: transition +10, urgent ×2, transition +1.

**Demo cue:** Queue lesson: process urgent, then transition; reset once.

**Speaker notes**

Save base state before the first skipped update. Retain later urgent updates as
replay copies as well as the skipped transition updates. Otherwise their ordering
is lost. Starting at 2 would double-apply the urgent effect to the wrong base.
Replaying the calculation is not publishing twice. Our tests use noncommutative
actions so an incorrect queue cannot accidentally pass.
Source: [updateReducerImpl][hooks]. Allow roughly 7 minutes for slides 8–10.

## 11 — Establish the real React baseline

**Takeaway:** compare the same workload before interpreting the difference.

**On screen**

- React 19.3.0, development, Strict Mode off.
- 120 row components, 2 ms deliberate work each.
- Ordinary updates: input and results update together.

**Demo cue:** Reset Search; ordinary mode; type `a` then `b`.

**Speaker notes**

Keep row cost and work distribution unchanged for the next comparison. The
actual input characters are React-controlled state. Results are a fixed list
whose render cost depends on the query, not a real search algorithm.
Source: [search.jsx](../demos/search.jsx). Saved trace context:
[profiling walkthrough](profiling-walkthrough.md#1-ordinary-search-the-baseline).

## 12 — A Transition needs an inexpensive urgent path

**Takeaway:** unchanged results can be skipped during urgent input rendering.

**On screen**

Real React:

```jsx
const SlowResults = memo(function SlowResults({ query, cost, shape }) {
  // Expensive result rendering; unchanged props can bail out.
});
```

Input updates now; results can catch up.

**Demo cue:** Switch to Transition; keep rows/2 ms; reset and type again.

**Speaker notes**

This slide is an excerpt, not a standalone component. `memo` matters here because
urgent input changes do not yet change the results props. The later changed-query
render still costs work. Splitting state alone would not make an unmemoized
expensive subtree free. Memoization is a performance aid, not a semantic guarantee.
Sources: [search.jsx](../demos/search.jsx), [memo][memo], [startTransition][transition].

## 13 — Read evidence at the right layer

**Takeaway:** committed work alone does not reveal an interrupted draft.

**On screen**

Recorded Transition run, relative to first input:

```text
0.7 ms    urgent commit
6.3 ms    interrupted Transition render begins
50.3 ms   second input handler
51.0 ms   second urgent commit
306.3 ms  final Transition commit begins
```

**Demo cue:** Open the saved Transition Performance trace. Then compare committed
work in a React DevTools Profiler recording during manual rehearsal.

**Speaker notes**

Edge 153.0.4234.48, headless scripted input, no CPU throttling. The trace explicitly
labels “Interrupted Render.” Its elapsed span includes yields; expand Main thread
to find Scheduler callbacks. These numbers are one observed run, not guarantees
or physical keystroke latency. The saved `<Profiler>` logs are callback data, not
DevTools extension exports. Six callbacks represent three commit times because
our profilers are nested. An extension export still needs a manual capture.
Sources: [measured walkthrough](profiling-walkthrough.md#2-transition-actual-interruption),
[Profiler][profiler], [Performance Tracks][tracks].

## 14 — Put the work back into one function

**Takeaway:** cooperative scheduling only helps at available checkpoints.

**On screen**

Same nominal CPU work:

```text
120 small component calls → checkpoints between units
1 long component call    → cannot yield within that call
```

Recorded indivisible tasks: about 243 ms and 242 ms.

**Demo cue:** Keep Transition; choose One indivisible call; reset and type.
Fallback: saved indivisible trace.

**Speaker notes**

React cannot interrupt the busy loop. The long tasks are directly visible in the
browser recording. Do not promise fixed chunk durations or interpret the automated
second-input interval as INP. Concurrency trades scheduling/repeated work for
responsiveness; it does not remove CPU cost.
Sources: [recorded limit](profiling-walkthrough.md#3-transition-plus-one-long-function-the-limit),
[workLoopConcurrentByScheduler][work-loop].
Allow about 15 minutes for slides 11–14 and the profiling walkthrough.

## 15 — Sometimes the work needs data, not more CPU

**Takeaway:** a pending resource is a different reason rendering cannot finish.

**On screen**

Educational resource's `read` operation:

```js
read() {
  if (status === 'pending') throw wakeable;
  if (status === 'rejected') throw result;
  return result;
}
```

**Demo cue:** Open `createResource` in the Suspense model source panel.

**Speaker notes**

This is an excerpt from the runnable educational helper. It keeps one stable
wakeable; settlement updates status/result. Throwing raw thenables here is a
model of notification/control flow, not a supported production data-fetching
integration. The real example uses `use` with a stable promise created outside
rendering. Source: [mechanisms.mjs](../examples/mechanisms.mjs), [use][use].

## 16 — A tiny Suspense boundary chooses a candidate

**Takeaway:** handling suspension prepares a candidate without publishing it.

**On screen**

Educational pseudocode of runnable `MiniSuspense` (guard/listener code abbreviated):

```js
try {
  return { status: 'content', content: children() };
} catch (value) {
  if (!isThenable(value)) throw value;
  listenOnce(value, scheduleRetry);
  return transition && hasRevealedContent
    ? { status: 'retained', content: current }
    : { status: 'fallback', content: fallback };
}
```

**Demo cue:** In the educational Suspense panel, Create pending B → Render.
Compare the candidate with the unchanged current output; discard it once.

**Speaker notes**

The excerpt abbreviates the inline guard and listener code as `isThenable` and
`listenOnce`; the source panel contains their complete implementation. This is
a renderer-owned boundary that invokes a child function, not an ordinary React
component catching errors around `return children`. JSX describes elements;
React invokes descendants later. In real React, Suspense is a special Fiber
boundary. `use` signals suspension with an internal exception; the work loop
retrieves the thenable, finds the active boundary, and marks capture/unwind work.
The raw thrown wakeable in our model is deliberately simpler.
Sources: [suspense.mjs](../demos/models/suspense.mjs),
[handleThrow][handle-throw], [throwException][throw], [updateSuspenseComponent][boundary].

## 16a — A ping is not a commit

**Takeaway:** resource readiness, retry rendering, and publication are separate.

**On screen**

```text
Pending read → boundary chooses fallback candidate → commit fallback
Resolve      → ping queues retry → render B candidate → commit B
```

For a Transition, revealed A can stay current while B waits.

**Demo cue:** Urgent model: Commit candidate → Resolve model resource.
Current still shows Loading. Render / Retry model prepares B; Commit shows B.
Reset model; repeat in Transition mode. Optional: Reject instead of Resolve.

**Speaker notes**

The runnable model deduplicates listeners by wakeable identity. Settlement only
requests a retry; it does not render or publish. Only `commit` changes current
output and revealed-content state. A discarded fallback candidate must not hide
committed A. Once fallback has actually committed, a later Transition must not
resurrect historical A. Rejection causes retry too, then `read` throws an error
outside Suspense. The buttons expose phases that real React drives automatically.
Real React tracks root ping lanes and committed-boundary retry listeners separately;
our single callback intentionally collapses those scheduling details. It also
omits nested boundaries, Offscreen trees, prewarming and fallback throttling.
Sources: [model](../demos/models/suspense.mjs), [pingSuspendedRoot][ping],
[attachSuspenseRetryListeners][retry].

## 17 — Urgent replacement versus Transition

**Takeaway:** a Transition can preserve already revealed content while its next resource waits.

**On screen**

Real React:

```jsx
const title = use(request.promise);
// Under <Suspense fallback={<Loading />}>
```

- Pending mount: fallback.
- Urgent replacement: fallback.
- Transition replacement: retain A, then reveal B.

**Demo cue:** Reset before each comparison; Load B, wait, Resolve.
Optional: pending mount and rejection.

**Speaker notes**

These outcomes describe this boundary and update setup, not every nested-boundary
case. Promise identity is stable, and the controls settle the resource explicitly.
In the recorded Transition run, the Suspended span lasts about 530 ms; that is
waiting, not 530 ms of rendering CPU. React also recorded prewarming/retry policy
omitted from the miniature. The ErrorBoundary handles rejected requests; Reset
creates a fresh scenario.
Sources: [Suspense][suspense], [use][use],
[measured waiting](profiling-walkthrough.md#4-suspense-waiting-is-not-rendering).
Allow about 10 minutes for slides 15–17.

## 18 — Render is not commit, and commit is not paint

**Takeaway:** responsiveness depends on more than interruptible rendering.

**On screen**

```text
Render candidate → commit host changes → browser layout / paint
```

- Rendering can restart.
- Commit work still has a cost.
- The browser controls rendering opportunities.

**Demo cue:** In Performance, distinguish React commit spans from browser events.

**Speaker notes**

Our simple ordinary DOM examples publish host changes synchronously in commit;
this is not a complete account of every experimental host/transition integration.
A “Waiting for Paint” React label is not a measured paint. Avoid using the toy
rAF counter as FPS evidence. This project has no dedicated large-DOM commit
benchmark: describe it as a limitation, not an implemented demo.
Passive effects are not guaranteed to run after paint; do not teach `useEffect`
as an unconditional after-paint callback.
Sources: [Performance Tracks][tracks], [HTML event loops][event-loop], [useEffect][effect].

## 19 — What to take back to application code

**Takeaway:** use priority deliberately and respect the limits.

**On screen**

- Keep urgent work small.
- Use Transitions for suitable non-urgent updates.
- Keep render pure: a draft may be discarded.
- Use a supported Suspense data integration.
- Measure the actual interaction.

**Demo cue:** Return to the five-lesson selector and map each takeaway to one lesson.

**Speaker notes**

Do not put expensive computation in the Transition callback expecting it to yield.
Do not build production fetching around our toy `read` helper.
Consider reducing work before adding more scheduling instrumentation.
The Scheduler, Fiber, queue and boundary models explain a mechanism; they are
not interchangeable with React's implementation.
Sources: [startTransition][transition], [Suspense][suspense], [use][use].

## 20 — Source to screen, with boundaries

**Takeaway:** keep public contracts, pinned internals and teaching models distinct.

**On screen**

- Public behavior: React documentation.
- Implementation: React 19.3.0, pinned commit.
- Simplified mechanisms: runnable models.
- Observations: saved traces and documented settings.
- Questions?

**Demo cue:** Share the demo guide, slide text, and profiling walkthrough.

**Speaker notes**

[Demo guide](demo-guide.md) contains code links, execution steps and deliberate
simplifications. [Profiling walkthrough](profiling-walkthrough.md) records actual
events and the remaining manual DevTools/rehearsal gaps. The original research
dossier is optional deeper reading, not the slide script. Both upstream source
directories stay read-only.
The [accuracy review](accuracy-review.md) records corrections and caveats for
the four suggested articles; they are secondary explanations, not our authority
for production implementation claims.

## Presenter source links

Links to internals all use the same pinned commit. The demo guide maps each symbol
and distinguishes the separate clone. No upstream implementation is copied into
these slide snippets; models/excerpts are the project's teaching code.

[transition]: https://react.dev/reference/react/startTransition
[memo]: https://react.dev/reference/react/memo
[suspense]: https://react.dev/reference/react/Suspense
[use]: https://react.dev/reference/react/use
[effect]: https://react.dev/reference/react/useEffect
[profiler]: https://react.dev/reference/react/Profiler
[tracks]: https://react.dev/reference/dev-tools/react-performance-tracks
[event-loop]: https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model
[idle]: https://w3c.github.io/requestidlecallback/
[scheduler-host]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/src/forks/Scheduler.js#L532-L561
[scheduler]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/src/forks/Scheduler.js#L459
[fiber]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiber.js#L323
[work-loop]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L3073
[hooks]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L1316
[ping]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L4970
[handle-throw]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L2302-L2369
[throw]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberThrow.js#L364-L485
[boundary]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberBeginWork.js#L2383-L2427
[retry]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberCommitWork.js#L1978-L2012
