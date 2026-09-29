# Concurrent React Under the Hood — Deep Talk Coverage Plan

**Baseline:** React 19.3.0 (`v19.3.0`)  
**Audience:** experienced React / frontend engineers  
**Goal:** explain how Concurrent React works internally and how Suspense is integrated into the same scheduling, reconciliation, and publication machinery.

This is **not** another API tutorial for `startTransition`, `useTransition`, `useDeferredValue`, or `<Suspense>`. Those APIs should only be used as entry points into the internals.

---

## 0. Core storyline

Use one continuous story:

```text
JavaScript cannot be preempted
        ↓
React needs resumable rendering
        ↓
Fiber stores traversal/work state outside the JS call stack
        ↓
current/WIP buffering keeps speculative work invisible
        ↓
lanes describe what work matters
        ↓
root scheduling + Scheduler decide when React gets CPU time
        ↓
React yields between Fiber work units
        ↓
urgent work can interrupt a Transition render
        ↓
update queues/rebasing preserve skipped work
        ↓
Suspense adds "this candidate cannot finish yet"
        ↓
React can retain/fallback/retry using the same lane/scheduler model
        ↓
only a completed candidate is committed
        ↓
commit + browser layout/paint remain real costs
```

Strongest overall message:

> **Scheduling, consistency, and publication are separate problems. React coordinates all three.**

---

## 1. JavaScript is still single-threaded

Start with the hard constraint.

```js
function ExpensiveComponent() {
  doCpuWorkFor100ms();
  return <div />;
}
```

React cannot interrupt this function halfway through arbitrary JavaScript execution.

Explain:

```text
React work
→ React voluntarily returns
→ JS stack becomes empty
→ browser gets control
→ input/other host work may run
→ React gets another host turn later
```

### Important points

- Concurrent React is **cooperative**, not preemptive.
- The browser cannot inject an input handler into the middle of a running component call.
- React can only yield after control returns to a checkpoint.
- The Scheduler's ~5 ms threshold is not a task-duration limit.

### Astra example

Use the **100 ms indivisible work unit** demo.

### Takeaway

> React can only yield after JavaScript gives control back to React.

---

## 2. Why Fiber exists

Explain why React needed to move traversal state out of a recursive JS stack.

A Fiber is:

- a persistent work/identity record
- not a thread
- not a scheduled task
- not necessarily a component
- not necessarily a DOM node

Show only useful fields:

```js
{
  tag,
  type,
  stateNode,

  return,
  child,
  sibling,

  pendingProps,
  memoizedProps,
  memoizedState,
  updateQueue,

  flags,
  subtreeFlags,

  lanes,
  childLanes,

  alternate
}
```

Group them:

- traversal: `return`, `child`, `sibling`
- state: `pendingProps`, `memoizedProps`, `memoizedState`, `updateQueue`
- commit/effects: `flags`, `subtreeFlags`, `deletions`
- scheduling: `lanes`, `childLanes`
- double buffering: `alternate`

### Astra code

Use `createFiber()`.

### Production source

`packages/react-reconciler/src/ReactFiber.js`

Especially `createWorkInProgress`.

### Takeaway

> **Fiber makes rendering resumable, but Fiber itself does not schedule anything.**

---

## 3. Current tree vs work-in-progress tree

Explain:

```text
current
```

is the committed tree.

```text
workInProgress
```

is the candidate React is preparing.

They are related through `alternate`.

```text
Current App       ↔       WIP App
    │                        │
Current Results   ↔       WIP Results
    │                        │
    └──── retained/shared host instances ────┘
```

Do not teach "React clones the whole DOM/tree every render."

React reuses alternate Fiber objects and retained host instances where possible.

### Why this matters

```text
current remains visible
WIP can be speculative
WIP can be abandoned/restarted
```

### Takeaway

> **Rendered does not mean published.**

This is the foundation for interruption, transitions, and Suspense.

---

## 4. Fiber traversal: `beginWork` and `completeWork`

Use:

```text
App
├── Header
└── Results
    ├── Row A
    ├── Row B
    └── Row C
```

Explain:

### `beginWork`

- execute/process the Fiber
- process hooks/update queue
- reconcile children
- possibly bail out
- move down

### `completeWork`

- finish host work
- prepare/record changes
- bubble flags and lanes
- move to sibling/parent

Order:

```text
begin App
begin Header
complete Header
begin Results
begin Row A
complete Row A
begin Row B
complete Row B
begin Row C
complete Row C
complete Results
complete App
```

### Astra code

Use:

```js
function performUnitOfWork(unit) {
  const child = beginWork(unit.alternate, unit);
  return child ?? completeUnitOfWork(unit);
}
```

and iterative `completeUnitOfWork`.

### Critical nuance

The yield boundary is not "every JS line."

One `performUnitOfWork()` can include:

- a whole component call
- hook processing
- child reconciliation
- ancestor completion

### Takeaway

> The **largest indivisible work unit** still determines worst-case blocking.

---

## 5. Concurrent work loop

Show the core idea:

```js
while (nextUnit !== null && !shouldYield()) {
  nextUnit = performUnitOfWork(nextUnit);
}
```

Two outcomes:

### Finished

```text
nextUnit === null
→ candidate finished
→ commit
```

### Yield

```text
shouldYield() === true
→ stop
→ return continuation
→ unwind JS stack
→ browser gets control
```

Correct a common myth:

> One Fiber is **not** one browser task.

Typical model:

```text
one Scheduler callback
  → Fiber A
  → Fiber B
  → Fiber C
  → Fiber D
  → yield
```

---

## 6. Scheduler internals

Explain the separation:

### Reconciler/Fiber knows

- components
- lanes
- Suspense
- render state

### Scheduler knows

- callbacks
- priorities
- expiration
- host yield checks
- requesting another host task

The Scheduler does **not** know what a Fiber or Suspense boundary is.

### Current React 19.3 host path

Conceptually:

```text
setImmediate (where available)
→ otherwise MessageChannel
→ otherwise setTimeout
```

Modern-browser teaching focus: `MessageChannel`.

Simplified version:

```js
const channel = new MessageChannel();
const queue = [];
let hostTaskScheduled = false;

channel.port1.onmessage = () => {
  hostTaskScheduled = false;
  queue.shift()?.();
  requestHostTask();
};

function schedule(callback) {
  queue.push(callback);
  requestHostTask();
}

function requestHostTask() {
  if (hostTaskScheduled || queue.length === 0) return;
  hostTaskScheduled = true;
  channel.port2.postMessage(null);
}
```

This deliberately small FIFO demonstrates host-task continuation. Real React's
Scheduler also tracks priorities and deadlines in task/timer heaps.

### Explain why it helps

```text
React slice
→ return
→ task ends
→ browser has control
→ MessageChannel task runs later
```

### Kill these myths

- MessageChannel does not know about lanes.
- MessageChannel is not React's priority model.
- `requestIdleCallback` is not the normal Fiber work-loop driver.
- `requestAnimationFrame` is not the normal Fiber work-loop driver.
- stable React does not simply use `scheduler.postTask` as the default path.

---

## 7. Tasks vs microtasks

Explain the two scheduling layers:

```text
setState
→ root marked
→ root-scheduling microtask
→ choose runnable lanes
→ sync work OR Scheduler callback
→ later host task for concurrent work
```

### Why not `await Promise.resolve()`?

Because Promise continuations stay in microtask processing.

A chain of microtasks may postpone:

- input tasks
- browser rendering
- other host tasks

### Takeaway

> Microtasks coordinate React scheduling; host tasks create opportunities for the browser to regain control.

Do not claim:

```text
task → guaranteed paint → next task
```

Paint is only a possible rendering opportunity.

---

## 8. Root scheduling

Trace:

```text
setState()
→ create update
→ choose lane
→ enqueue update
→ mark Fiber/root lanes
→ ensureRootIsScheduled()
→ root microtask
→ getNextLanes()
→ sync flush OR Scheduler callback
```

### Production source

`ReactFiberRootScheduler.js`

### Key point

React usually schedules **work on a root**, not one Scheduler callback per component.

---

## 9. Lanes

Start with toy lanes:

```js
const SyncLane = 0b0001;
const DefaultLane = 0b0010;
const TransitionLane = 0b0100;
const RetryLane = 0b1000;
```

Explain:

```js
pendingLanes |= TransitionLane;
```

and:

```js
const highest = lanes & -lanes;
```

Then expand to real concepts:

- pending lanes
- suspended lanes
- pinged lanes
- expired lanes
- entangled lanes
- transition lanes
- deferred lanes
- retry lanes
- hydration lanes
- idle/offscreen work

### Essential distinction

```text
TransitionLane !== Scheduler LowPriority
```

Transition work commonly maps to Scheduler **NormalPriority**.

Default work can also map to NormalPriority while having different reconciler behavior.

### Takeaway

> Scheduler priority answers **when a root callback runs**.  
> Lanes answer **which React work participates in that render**.

### Production source

`ReactFiberLane.js`

---

## 10. Trace `startTransition` internally

Do not reteach API syntax.

Explain conceptually:

```js
startTransition(() => {
  setQuery(value);
});
```

During the synchronous transition scope:

```text
Transition context installed
→ setState()
→ requestUpdateLane()
→ Transition lane chosen
```

Then ordinary root scheduling continues.

### Important correction

This does not make arbitrary CPU work asynchronous:

```js
startTransition(() => {
  expensiveCalculation(); // still synchronous
});
```

Only updates created in the transition context receive transition scheduling semantics.

### React 19 note

`isPending` represents a Transition/Action lifecycle, not "a background thread is busy."

---

## 11. Main demo: controlled input + slow results

Use this as the centerpiece:

```jsx
function Search() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');

  function onChange(e) {
    const value = e.target.value;

    setInput(value);

    startTransition(() => {
      setQuery(value);
    });
  }

  return (
    <>
      <input value={input} onChange={onChange} />
      <SlowResults query={query} />
    </>
  );
}
```

### Type `"a"`

```text
input event
→ setInput("a") → urgent / Sync lane
→ setQuery("a") → Transition lane
```

Urgent input can commit while old results remain visible.

Transition rendering then begins.

```text
Scheduler task
  Search
  SlowResults
  Row 1
  Row 2
  Row 3
  ...
  yield
```

### Then type `"b"`

```text
input event
→ setInput("ab") urgent
→ setQuery("ab") transition
```

Higher-priority work may interrupt the unfinished transition render.

### Correct the simplified model

Useful:

```text
"a":
Fiber 1 ✓
Fiber 2 ✓
Fiber 3 not started

"b" arrives
```

But explain:

1. React cannot interrupt Fiber 3 halfway through arbitrary JS.
2. A new update does not blindly delete every old Fiber.
3. queued update intent remains.
4. alternate Fiber objects can be reused.
5. bailouts may reuse unaffected information.
6. unfinished `"a"` output is not partially committed.

### Astra demo

Use `mini-concurrent-react-demo.html` / `mini-concurrent-react.mjs`.

---

## 12. Update queues and rebasing

This is an important advanced section.

Use a noncommutative queue:

```text
A: transition   +10
B: urgent       ×2
C: transition   +1
```

Urgent work can skip transition updates temporarily.

Later React must replay skipped work in correct logical order.

Explain:

- `baseState`
- base queue
- pending queue
- skipped updates
- lane filtering
- replay/rebase

### Why it matters

Concurrent React needs to say:

```text
not now
```

without saying:

```text
forget this update
```

### Astra proof

Use the queue demo:

```text
urgent intermediate state = 2
eventual state = 23
```

### Takeaway

> Interrupting a render attempt is not the same as canceling the state update.

---

## 13. Bailouts and reuse

Keep shorter.

Explain how React can avoid unnecessary work using:

- props/state identity
- memoization
- `lanes`
- `childLanes`
- subtree information

### Practical warning

Even with a Transition, the urgent path can still be slow if it re-enters an expensive subtree.

Example:

```text
urgent Search rerender
→ SlowResults rerenders with old query
→ expensive work blocks input
```

State localization and memoization may be necessary to keep the urgent path small.

---

## 14. Render vs commit

Make this explicit before Suspense.

### Render phase

React may:

- execute components
- process hooks/update queues
- reconcile children
- build/reuse WIP Fibers
- prepare host changes
- record flags
- bubble flags/lanes

It does **not** publish each Fiber incrementally.

Wrong:

```text
Fiber A renders → DOM A changes
Fiber B renders → DOM B changes
yield
```

Better:

```text
prepare coherent candidate
→ commit candidate
```

### Commit phase

Cover conceptually:

- before-mutation
- mutation
- current-tree switch
- layout effects / refs
- passive effects later/conditionally

### Core limitation

Ordinary DOM mutation/layout commit work is not time-sliced like the render loop.

---

## 15. "Huge rerender is inevitable" — separate the costs

Split the cost into three layers.

### A. React render calculation

```text
component execution
reconciliation
Fiber traversal
```

Eligible work can often be spread across host turns.

### B. Commit / DOM mutation

```text
insert/remove
properties
refs
layout effects
```

Still a publication boundary and normally synchronous.

### C. Browser rendering

```text
style
layout
paint
compositing
```

Fiber does not time-slice the browser rendering engine.

### Demo

**Proposed demo — not implemented yet:** build a controlled "cheap render,
huge DOM publication" comparison. Do not present the existing miniature as a
recording of this case; its snapshot adapter is only an educational host model.

### Takeaway

> Concurrent React improves **responsiveness and scheduling**, not the fundamental cost of creating or painting a huge UI.

This naturally motivates:

- virtualization
- pagination
- DOM reduction
- layout optimization
- Web Workers for suitable pure computation

---

## 16. Introduce Suspense as part of the same architecture

Do not frame Suspense as "the spinner feature."

Frame it as:

> Concurrent rendering asks **"Can this candidate finish now?"**  
> Suspense provides a structured answer: **"This subtree cannot finish yet."**

---

## 17. What suspending means

Modern public model:

```js
const value = use(promise);
```

If the value is pending, the intended subtree cannot currently complete.

React does **not** freeze the JS stack and later restore local variables.

Rendering unwinds, and React retries later.

### Educational model

Use Astra's simplified example:

```js
try {
  render();
} catch (thing) {
  if (!isThenable(thing)) throw thing;
  // Either outcome makes the resource worth trying again. A rejection is then
  // thrown during render and handled by the normal error path.
  thing.then(scheduleRetry, scheduleRetry);
  renderFallback();
}
```

Clearly label it:

> Simplified teaching implementation — production React has dedicated suspension/capture/wakeable machinery.

Do not encourage ad-hoc manual promise throwing as app architecture.

---

## 18. Suspense boundary capture

Explain:

```text
descendant render suspends
→ React locates nearest Suspense boundary
→ boundary captures
→ incomplete work unwinds
→ React selects another valid presentation
```

That presentation may be:

```text
fallback
```

or, depending on update context:

```text
previously revealed content
```

This is the bridge to Transitions.

---

## 19. Wakeables, pings, and retry lanes

Explain the lifecycle:

```text
pending thenable
→ React attaches listener
→ boundary retains old UI or fallback
→ thenable settles
→ root is pinged
→ retry work becomes eligible
→ root scheduled
→ render retried
→ commit when ready
```

### Lane integration

Suspense uses the same scheduling machinery:

- suspended lanes
- pinged lanes
- Retry lanes
- root scheduling
- Fiber work loop
- commit

### Strong line

> Promise resolution does **not** directly update the DOM. It makes React work runnable again.

---

## 20. Suspense + Transition integration

This should be one of the most important sections.

### Urgent update suspends

```text
visible UI
→ urgent replacement
→ new tree suspends
→ boundary may show fallback
```

### Transition update suspends

```text
visible UI already exists
→ transition prepares replacement
→ replacement suspends
→ old revealed UI can remain visible
→ resource becomes ready
→ retry
→ commit new UI
```

### Key explanation

Transitions and Suspense work together because:

- the update is marked non-urgent through lanes
- the boundary gives React a valid presentation strategy
- retries are schedulable work

### Takeaway

> Suspense is deeply integrated into Concurrent React; it is not a separate loading mechanism layered on afterward.

---

## 21. Hidden / Offscreen work

Optional advanced section.

Explain conceptually:

```text
content may remain represented
while not currently visible
```

Useful for:

- retained state
- hidden trees
- background work
- reconnecting layout effects
- Suspense content/fallback management

### React 19.3 note

`Activity` is stable.

Do not teach a generic public `<Offscreen>` API as the normal stable interface.

---

## 22. Suspense is broader than data fetching

Briefly mention:

- lazy code
- `use(promise)`
- framework resource caches
- styles/resources
- View Transition coordination

In React 19.3, Suspense composes with stable `<ViewTransition>` for reveal animations.

Useful framing:

> Suspense is a render/presentation coordination primitive, not just a data-fetching spinner.

---

## 23. Purity, abandoned work, and Strict Mode

Because render may be:

- restarted
- abandoned
- repeated
- suspended

render-phase side effects are unsafe.

Bad:

```js
function Component() {
  externalArray.push(value);
  return ...;
}
```

An abandoned render can still mutate that external state.

### Strict Mode

Use it to explain unsafe assumptions, but say clearly:

> Strict Mode double invocation is not Concurrent React itself.

It is a development mechanism that helps expose code that assumes render runs exactly once.

---

## 24. External stores and tearing

Optional expert section.

Example:

```text
Component A reads store X
React yields
store changes to Y
Component B reads store Y
```

Candidate UI could contain inconsistent snapshots.

Explain why `useSyncExternalStore` exists:

- stable snapshot contract
- subscription semantics
- consistency validation

### Takeaway

> Concurrency is also a consistency problem, not just a priority problem.

---

## 25. React 19.3 details worth mentioning

Keep this short and clearly version-specific.

### Independent transitions

React 19.3 allows more independent transition progress than older "all transitions are one global batch" mental models.

"Parallel" does **not** mean multiple JS threads.

### Lane structure changed

Do not rely on old fixed Transition-lane diagrams from older articles.

### Scheduler host mechanism

Stable scheduling is still cooperative; do not teach that React has switched wholesale to `requestIdleCallback` or default `scheduler.postTask`.

### Activity

Stable and relevant to hidden/retained trees.

### ViewTransition

Stable and relevant to Suspense reveal/commit orchestration.

---

## 26. Profiling: prove the layers separately

Use multiple tools.

### React DevTools Profiler

Good for committed component work.

Limitation: a commit-focused view can miss some CPU spent on abandoned candidate work.

### React Performance Tracks

Useful for:

- scheduling
- Transition activity
- Suspense
- alignment with browser timeline

### Browser Performance panel

Useful for:

- input event
- JS tasks
- MessagePort callbacks
- long tasks
- style/layout
- paint

### Trace-reading order

1. Find the input event.
2. Check whether its handler started late.
3. Find urgent React render/commit.
4. Confirm old results remain while input changes.
5. Follow Transition work across task boundaries.
6. Distinguish **yield/interruption** from **Suspense waiting**.
7. Find final commit.
8. Inspect layout/paint.
9. Compare total CPU, not only responsiveness.

---

## 27. Recommended demo sequence

### Demo 1 — 100 ms indivisible component

Purpose: prove React cannot preempt arbitrary JS.

### Demo 2 — Mini Fiber traversal

Use `createFiber`, `performUnitOfWork`, `beginWork`, `completeUnitOfWork`.

Purpose: show resumable traversal state.

### Demo 3 — MessageChannel Scheduler

Purpose: show `work → yield → host → continuation`.

### Demo 4 — Lane bitmasks

Purpose: separate React work selection from host callback priority.

### Demo 5 — `"a" → "ab"` search

Use Astra's MiniConcurrentReact.

Purpose: combine Fiber + Scheduler + lanes + interruption.

### Demo 6 — Rebase queue

Use:

```text
A +10 transition
B ×2 urgent
C +1 transition
```

Purpose: prove skipped updates survive.

### Demo 7 — Suspense mechanism

Show:

```text
pending thenable
→ boundary capture
→ listener
→ fallback/retain
→ ping
→ retry
→ commit
```

### Demo 8 — Transition + Suspense

Compare urgent suspension vs transition suspension.

### Demo 9 — Commit bottleneck

Cheap render + many DOM nodes.

Purpose: prove concurrency does not make publication/layout free.

---

## 28. Important React source files to reference

### Fiber

```text
packages/react-reconciler/src/ReactFiber.js
```

Key concept: Fiber shape, `createWorkInProgress`.

### Work loop

```text
packages/react-reconciler/src/ReactFiberWorkLoop.js
```

Key concepts:

- sync/concurrent render paths
- `performUnitOfWork`
- `completeUnitOfWork`
- yield loop
- render exit/suspension handling

### Begin / complete

```text
ReactFiberBeginWork.js
ReactFiberCompleteWork.js
```

### Lanes

```text
ReactFiberLane.js
```

Key concepts:

- `getNextLanes`
- suspended/pinged/expired/entangled lanes

### Root scheduler

```text
ReactFiberRootScheduler.js
```

Key concepts:

- `ensureRootIsScheduled`
- microtask processing
- Scheduler callback selection/reuse

### Event priority

```text
ReactEventPriorities.js
```

### Hooks/update queues

```text
ReactFiberHooks.js
ReactFiberClassUpdateQueue.js
```

### Suspense

```text
ReactFiberThrow.js
ReactFiberSuspenseComponent.js
ReactFiberWorkLoop.js
```

### Commit

```text
ReactFiberCommitWork.js
```

### Scheduler

```text
packages/scheduler/src/forks/Scheduler.js
```

Key concepts:

- task queue
- timer queue
- `shouldYieldToHost`
- `performWorkUntilDeadline`
- MessageChannel host integration

---

## 29. Myth vs reality slide

| Myth                                           | Correct model                                                 |
| ---------------------------------------------- | ------------------------------------------------------------- |
| Concurrent React is multithreaded              | It cooperatively uses normal JS/main-thread execution         |
| Transition uses Web Workers                    | No automatic worker is involved                               |
| React interrupts a component halfway through   | It yields only after JS control returns                       |
| One Fiber = one browser task                   | One callback usually processes many Fibers                    |
| Fiber schedules itself                         | Root scheduler + Scheduler schedule work                      |
| Transition = Scheduler LowPriority             | Transition lanes commonly map to Scheduler NormalPriority     |
| MessageChannel is React's priority system      | It is mainly a host task mechanism                            |
| React always resumes exactly where it stopped  | Work may continue, restart, rebase, bail out, or be abandoned |
| Abandoned render loses updates                 | Queues preserve intent and rebase skipped work                |
| Rendering a Fiber updates visible DOM          | Publication happens during commit                             |
| Concurrent rendering makes giant commits cheap | Mutation/layout/paint still cost real time                    |
| Suspense is a spinner API                      | It is a render-completion/presentation boundary               |
| Suspense freezes the JS stack                  | Render unwinds and retries later                              |
| Promise resolution updates the DOM             | It pings/schedules React work                                 |
| `useDeferredValue` is debounce                 | It is scheduling/deferred rendering, not a timer              |
| StrictMode double render is concurrency        | It is a dev check exposing unsafe assumptions                 |
| 5 ms means React tasks are capped at 5 ms      | React cannot preempt the current unit                         |

---

## 30. Senior-engineer questions to prepare for

### What exactly is scheduled?

Usually a callback to perform work on a **root**, not one task per Fiber.

### Why both microtasks and tasks?

Microtask coordinates roots/sync work; a later host task gives the browser an opportunity to do other work.

### Why not yield with `await Promise.resolve()`?

Promise continuation stays in microtask processing and may starve the host work you wanted to admit.

### Is Fiber a coroutine?

Only loosely. It stores resumable React work state but does not preserve arbitrary paused JS stack frames.

### Why can a "5 ms" Scheduler produce a 100+ ms task?

Because the checkpoint is cooperative; a 100 ms unit cannot be interrupted.

### Why can NormalPriority render synchronously?

Scheduler callback priority and lane/render-loop policy are different dimensions.

### Does React throw away all work on interruption?

No simple yes/no. The candidate may be abandoned as a commit result, while Fiber storage, current-tree data, queues, and bailout information remain reusable.

### Why replay an update that already committed?

To preserve ordering when earlier low-priority updates were skipped and must later be rebased.

### Why can input still lag with a Transition?

Possible causes:

- urgent path still rerenders expensive children
- one indivisible component is expensive
- previous commit/layout/paint blocks
- layout effects are expensive
- unrelated main-thread JS blocks

### Is a suspended Transition canceled?

No. The render is blocked/incomplete; resource/network work and queued update intent have separate lifecycles.

---

## 31. Recommended talk order

### Part I — Constraint

1. JS run-to-completion.
2. Why React cannot interrupt arbitrary code.
3. Why Fiber exists.

### Part II — Resumable rendering

4. Current/WIP trees.
5. `beginWork` / `completeWork`.
6. `performUnitOfWork`.
7. concurrent work loop.
8. Scheduler + MessageChannel.
9. tasks vs microtasks.
10. root scheduler.

### Part III — Prioritization

11. lanes.
12. lanes vs Scheduler priority.
13. internal `startTransition`.
14. `"a" → "ab"` walkthrough.
15. interruption semantics.
16. update queues and rebasing.
17. bailouts.

### Part IV — Publication

18. render vs commit.
19. why partial WIP stays invisible.
20. commit/layout/paint bottlenecks.

### Part V — Suspense integration

21. what suspension means.
22. boundary capture.
23. wakeables and pings.
24. retry lanes.
25. Transition + Suspense retained content.
26. optional Offscreen / Activity / ViewTransition.

### Part VI — Correctness

27. purity.
28. Strict Mode.
29. effects.
30. tearing / `useSyncExternalStore`.

### Part VII — Evidence

31. profiling.
32. indivisible-work demo.
33. commit-bottleneck demo.
34. myths.
35. final mental model.

---

## 32. Keep these short because you covered them before

Do not spend much time on:

- `useTransition` syntax
- basic `isPending`
- basic `startTransition` usage
- basic `useDeferredValue` usage
- simple `<Suspense fallback>` examples
- generic "make typing responsive" demos

Use one sentence:

> "We covered the APIs previously. Today we follow what happens after those calls."

Then go directly to:

```text
requestUpdateLane
→ root scheduling
→ lanes
→ Scheduler
→ Fiber work loop
```

---

## 33. Optional deep cuts

Move these to Q&A or a second session if needed:

- exact lane bit positions
- starvation/expiration constants
- hydration lane variants
- async Action entanglement
- SuspenseList internals
- streaming SSR/selective hydration
- Activity implementation details
- View Transition commit orchestration
- eager state-update optimization
- passive-effect timing edge cases

---

## 34. Minimum ~45-minute version

Cover:

1. JS run-to-completion
2. Fiber + current/WIP
3. `performUnitOfWork`
4. work loop/yield
5. Scheduler + MessageChannel
6. lanes
7. `"a" → "ab"` timeline
8. rebasing
9. render vs commit
10. Suspense capture/ping/retry
11. Suspense + Transition
12. commit/layout limitation
13. myths + final model

---

## 35. Deep ~75–90-minute version

Use:

```text
event-loop constraint
→ Fiber
→ traversal
→ WIP buffering
→ Scheduler
→ root scheduler
→ lanes
→ Transition trace
→ rebasing
→ commit
→ Suspense internals
→ retry lanes
→ retained UI
→ Offscreen
→ effects/purity
→ tearing
→ profiling
→ bottlenecks
```

Interleave Astra's code examples with the concepts instead of putting all demos at the end.

---

## 36. Final slide

```text
React does not make JavaScript parallel.

Fiber turns rendering into explicit resumable work.

Lanes tell React which work belongs together and how urgently it matters.

The root scheduler decides which lanes should run.

The Scheduler gives React chunks of main-thread time and lets it yield back to the host.

The work-in-progress tree lets React calculate UI speculatively without exposing half-finished results.

Transitions make some updates interruptible/non-urgent.

Suspense says that a candidate subtree cannot finish yet and gives React a boundary where it can retain, fall back, and retry.

A resolved resource only makes work runnable again; React still has to render and commit.

Commit publishes a coherent result.

And if the final DOM/layout/paint is huge, concurrency cannot make that cost disappear.
```

Shortest summary:

> **Concurrent React is a system for scheduling speculative renders and publishing only coherent results. Suspense is integrated by turning "not ready" into schedulable, retryable work.**

---

## 37. Astra artifacts to integrate

The Astra dossier references:

```text
examples/mini-concurrent-react.mjs
examples/mechanisms.mjs
examples/verify.mjs
mini-concurrent-react-demo.html
```

Suggested placement:

| Artifact / mechanism                  | Section                    |
| ------------------------------------- | -------------------------- |
| `createFiber`, `createWorkInProgress` | Fiber + double buffering   |
| `performUnitOfWork`                   | traversal                  |
| simplified `createScheduler`          | Scheduler / MessageChannel |
| lane helpers                          | lanes                      |
| `processQueue` / rebase               | update queues              |
| `MiniConcurrentReact` search demo     | main Transition example    |
| `createResource` / `createBoundary`   | Suspense                   |
| commit snapshot adapter               | render vs commit           |
| store consistency helper              | tearing                    |
| deterministic verification            | Q&A / backup               |

Every educational snippet should be labelled:

```text
Simplified teaching implementation — not production React source
```

Then show the corresponding real React file/function.

---

## 38. Source-reading path for your preparation

Read in this order:

```text
1. ReactFiber.js
2. ReactFiberWorkLoop.js
3. ReactFiberBeginWork.js
4. ReactFiberCompleteWork.js
5. ReactFiberRootScheduler.js
6. ReactFiberLane.js
7. ReactEventPriorities.js
8. Scheduler.js
9. ReactFiberHooks.js / update-queue code
10. ReactFiberThrow.js
11. ReactFiberSuspenseComponent.js
12. ReactFiberCommitWork.js
```

Follow one scenario through the code:

```text
input event
→ setState
→ request lane
→ schedule root
→ pick lanes
→ render root
→ work loop
→ yield/suspend/finish
→ commit
```

Then trace the same scenario with a pending Suspense resource.
