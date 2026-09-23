# Concurrent React — Standalone Context Pack

**Purpose:** dense source-grounded context for advanced analysis, teaching and follow-up research.  
**Baseline:** React **19.3.0**, tag **`v19.3.0`**, commit **`1d34f91dfde6bba84d08b683aaba164c7194dacb`**.  
**Evidence checked:** 18 September 2026; dossier finalized 19 September 2026.  
**Scope:** open-source stable React DOM client. Server, native, profiling, development and experimental forks are distinct. Implementation details below refer to this revision, not a permanent API contract.

**Labels:** PUBLIC CONTRACT = documented stable behavior; CURRENT IMPLEMENTATION = inspected code; HISTORICAL DETAIL = superseded/origin material; EXPERIMENTAL / CANARY = outside the stable baseline. Educational code is original simplification, not React-compatible source.

## 1. Baseline and critical corrections

[Release](https://github.com/react/react/releases/tag/v19.3.0), [versions](https://react.dev/versions), [release article](https://react.dev/blog/2026/09/09/react-19-3). Stable exports and feature flags are essential evidence: [exports][exports], [flags][flags].

- **CURRENT IMPLEMENTATION:** `enableParallelTransitions = true`; transition-update lanes can be selected independently. This does not remove same-event lane reuse, shared-state-queue entanglement or overlapping async-Action coupling. It does not add threads.
- **CURRENT IMPLEMENTATION:** `enableViewTransition = true`; eligible commits can have asynchronous orchestration, including waits between mutation and layout. Ordinary mutation/layout traversals themselves remain synchronous.
- **CURRENT IMPLEMENTATION:** `enableThrottledScheduling = false`; the ordinary concurrent loop uses Scheduler's predicate. A separate 25 ms non-idle / 5 ms idle loop exists but is not the selected stable path.
- **CURRENT IMPLEMENTATION:** Scheduler default `frameYieldMs = 5`; a cooperative threshold, not a task-duration cap.
- **PUBLIC CONTRACT:** Activity is stable; ViewTransition and `addTransitionType` are stable in 19.3. A public Offscreen component and `unstable_SuspenseList` are not stable exports. Gesture transitions remain experimental.

## 2. Layer ownership and end-to-end update route

| Layer | Responsibility |
| --- | --- |
| Browser event loop | Choose runnable tasks, run microtask checkpoints, allow rendering opportunities |
| DOM event system | Dispatch handlers under React event/update priority |
| Hook/class queue | Preserve ordered updates and base history |
| Lanes | Encode eligible work sets, urgency, suspension and dependencies |
| Root scheduler | Coordinate roots, sync flushing and callback reuse/replacement |
| Scheduler package | General callbacks, deadlines, host tasks and cooperative yield predicate |
| Fiber/reconciler | Persistent work records, traversal, reconciliation, suspension and retry |
| DOM renderer/commit | Prepare host instances and publish completed changes |
| Browser rendering | Style, layout, paint and compositing |

Ordinary path: event → context/priority → `setState` update+lane → queue/staged concurrent update → mark Fiber/ancestor/root lanes → `ensureRootIsScheduled` → root microtask → sync flush or Scheduler callback → `performWorkOnRoot` → render loop → `beginWork`/reconcile/`completeWork` → completed candidate → commit readiness → mutation/current switch/layout → host rendering and passive effects, whose relative order is conditional. [Dispatch][dispatch], [staging][concurrent-queues], [root scheduler][root-scheduler], [work gate][work-gate]

Exceptions include eager equal-state bailout, controlled-input cleanup flushing before the microtask, suspension, resource-blocked commit and View Transition orchestration. Render output is speculative until published; queue intent can survive an abandoned attempt.

## 3. Fiber and traversal

**CURRENT IMPLEMENTATION.** Fiber is a work/identity record, not a thread, DOM node or scheduled task. Important fields: `tag`, `key`, `elementType`, resolved `type`, tag-specific `stateNode`; `return`, `child`, `sibling`, `index`; `ref`, `refCleanup`; `pendingProps`, `memoizedProps`, `memoizedState`, `updateQueue`, `dependencies`; `flags`, `subtreeFlags`, `deletions`; `lanes`, `childLanes`, `alternate`, `mode`. Function hooks form a chain in `memoizedState`; `updateQueue` has different meanings by tag. [Fiber type][fiber-type]

`root.current` is committed. `createWorkInProgress` lazily creates/reuses its alternate, copies identity/state/queue/lane information, resets per-attempt effects/deletions, preserves static flags and clones the dependency header. Current and WIP share retained host instances and may share child subtrees. Roles swap after commit; no full second live DOM exists. Storage reuse does not guarantee stale computed output is reusable. [Creation/copy][fiber-copy]

Traversal stores return points in links rather than one giant recursive JS stack. Abstract requested tree order: begin App; begin Header; complete Header; begin Results; begin/complete Row A; begin/complete Row B; begin/complete Row C; complete Results; complete App. Real JSX adds host/text/root/wrapper Fibers.

```js
function performUnitOfWork(unit) {
  const child = beginWork(unit.alternate, unit);
  return child ?? completeUnitOfWork(unit);
}
function completeUnitOfWork(unit) {
  while (unit) {
    completeWork(unit.alternate, unit);
    if (unit.sibling) return unit.sibling;
    unit = unit.return;
  }
  return null;
}
while (nextUnit && !shouldYield())
  nextUnit = performUnitOfWork(nextUnit);
```

Pseudocode omits real props bookkeeping, exceptions, profiling and completion paths that return further work. One unit can include a full component function, reconciliation loop and multiple ancestor completions. React cannot pause an arbitrary component instruction. A 100 ms call blocks for 100 ms. Suspension at `use` throws/unwinds; it does not preserve a paused language stack. [Unit loop][work-loops], [completion][complete-unit]

## 4. Event loop and Scheduler

A yield means ordinary returns through the reconciler/root/Scheduler stack, retaining heap/module work state and posting a later callback. Only after control returns can a later input task run. Multiple browser task sources exist; there is no universal FIFO macrotask queue and no guaranteed paint/input task between slices. Microtask-only continuations can keep the host from reaching the desired rendering/input opportunity. [Platform model](https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model)

**CURRENT IMPLEMENTATION:** default host preference is `setImmediate` → `MessageChannel` → `setTimeout`. setImmediate is relevant especially in Node; ordinary browsers use MessageChannel. MessageChannel supplies host tasks and avoids nested-timer clamping, but has no lanes/components. rAF and requestIdleCallback are not the normal Fiber work-loop driver. `scheduler/unstable_post_task` is a separate entry/fork, not an automatic replacement when a browser exposes postTask. [Scheduler host][scheduler-host], [entry][scheduler-entry], [PostTask fork][scheduler-posttask]

Scheduler keeps `timerQueue` ordered by delayed start time and `taskQueue` by expiration, with IDs breaking ties. `advanceTimers` moves eligible delayed tasks. `unstable_scheduleCallback` builds a record with callback/priority/start/expiration/sort index. Timeout constants: Immediate −1 ms; UserBlocking 250 ms; Normal 5000 ms; Low 10000 ms; Idle a large sentinel. These are deadlines, not intentional delays or slice sizes. [Scheduling][scheduler-schedule], [heap][scheduler-heap]

Call path: `performWorkUntilDeadline` → `flushWork` → `workLoop` → root callback. `shouldYieldToHost` observes elapsed time and enabled paint requests. Returned continuation is stored on the same task and causes a host yield even if budget remains. Cancellation nulls a callback; it cannot abort executing JS. Expired tasks can bypass normal yielding. [Scheduler loop][scheduler-work], [flags][scheduler-flags]

## 5. Root scheduler and priority mapping

`ensureRootIsScheduled` deduplicates roots in a linked list and requests one scheduling microtask. `processRootScheduleInMicrotask` iterates roots, marks starved lanes, schedules/cancels/reuses callbacks, removes inactive roots, flushes eligible sync work and resets the event transition lane. Pending async commit phases can prevent a flush. [Microtask processing][root-microtask]

`root.callbackPriority` is a representative **lane**, not a Scheduler enum. `scheduleTaskForRootDuringMicrotask` maps eligible work to a callback. At execution, `performWorkOnRootViaSchedulerTask` checks pending commits, flushes pending effects, reselects lanes and returns a continuation only if the root still owns the same callback node. [Scheduling][root-task], [callback][root-callback]

| Work | Typical root route | Ordinary render policy |
| --- | --- | --- |
| Discrete input/Sync | Sync flush, often without Scheduler callback | Blocking |
| Continuous input | Scheduler UserBlocking | Blocking lane classification |
| Default | Scheduler Normal | Blocking lane classification |
| Transition update/deferred | Usually Scheduler Normal | Concurrent unless forced, expired or exceptional |
| Retry | Scheduler Normal | Usually concurrent; retry policy matters |
| Idle/Offscreen | Scheduler Idle | Usually concurrent |

**TransitionLane is not Scheduler LowPriority. Asynchronous callback scheduling is not proof of interruptible rendering.** `performWorkOnRoot` uses `!forceSync && !includesBlockingLane && !includesExpiredLane`, with a prerender exception. Scheduler timeout can force sync in this build. [Event conversion][event-lane], [blocking mask][blocking-lanes], [gate][work-gate]

Controlled event cleanup checks restoration needs, calls `flushSyncWork`, then restores the controlled state; input commits can occur before the scheduling microtask. `act` can use its own testing queue, so it is unsuitable for measuring host yielding. [Controlled batching][controlled-batching]

## 6. Lanes and dependencies

31 usable bits; lower bits generally indicate higher priority, with grouping/policy exceptions. Exact zero-based bit layout in this tag:

| Bits | Meaning |
| --- | --- |
| 0 / 1 | SyncHydration / Sync |
| 2 / 3 | InputContinuousHydration / InputContinuous |
| 4 / 5 | DefaultHydration / Default |
| 6 / 7 | Experimental Gesture / TransitionHydration |
| 8–17 | Ten transition-update lanes |
| 18–21 | Four transition-deferred lanes |
| 22–25 | Four retry lanes |
| 26 / 27 | SelectiveHydration / IdleHydration |
| 28 / 29 / 30 | Idle / Offscreen / Deferred marker |

`a | b`: union; `a & b`: overlap; `lanes & -lanes`: lowest set bit; `a & ~b`: removal; `(set & subset) === subset`: containment, including NoLane=0. [Lane layout/grouping][lane-groups]

Root masks: `pendingLanes` outstanding work; `suspendedLanes` blocked work; `pingedLanes` blocked work whose dependency signaled; `warmLanes` explored suspended work; `expiredLanes` ready work past policy deadlines; `entangledLanes` plus per-lane relationships for coupled rendering. Fiber `lanes` are local and `childLanes` summarize descendants.

`getNextLanes`: prefer nonidle pending work; within it unblocked, then pinged, then eligible un-warmed prerender work. Idle is considered only when no nonidle work remains. Keep an existing attempt when new work is not sufficiently higher priority; Default specifically does not interrupt an ongoing transition. Selected lanes can expand via entanglement. [Selection][next-lanes], [entanglement][entangled-lanes]

Stable grouping: urgent update lanes can group; transition-update selection chooses an individual highest lane with parallel transitions enabled; deferred and retry groups have separate grouping. Allocation rotates finite sets and can wrap. Same-event transition lane caching and shared-queue entanglement prevent interpreting every `startTransition` call as a unique transaction. [Transition allocation][transition-lane], [queue entanglement][hook-entanglement]

Lane expiration: sync/continuous class 250 ms; default/transition class 5000 ms; retry expiration flag disabled; selective/idle/offscreen/deferred marker do not get ordinary expiration. Ready/pinged eligibility matters. Expiration affects render policy; it does not rewrite every update to Sync. Scheduler task expiration is a separate mechanism. [Expiration][lane-expiration]

## 7. Update queues, rebasing and interruption

Hook pending/base queues preserve enqueue order. In `updateReducerImpl`, merge circular pending/base lists; first skipped update records new base state; skipped updates keep their lanes; subsequently included updates are also retained as NoLane replay clones. The current queue retains necessary history across abandoned WIP. Class/root queues use related persistent lists and suppress repeated callbacks on replay. [Hook queue][hook-queue], [class queue][class-queue]

Proof example: initial 1; A transition `+10`; B Sync `×2`; C transition `+1`. Urgent render shows 2; base stays 1; retained queue A(T), B(0), C(T). Eventual replay gives 23. Applying skipped work to the visible 2 gives incorrect 13.

```js
function rebase(base, updates, lanes) {
  let state = base, saved = base, skipped = false;
  const rest = [];
  for (const u of updates) {
    const include = u.lane === 0 || (u.lane & lanes) === u.lane;
    if (!include) {
      if (!skipped) saved = state;
      skipped = true; rest.push({...u});
    } else {
      state = u.action(state);
      if (skipped) rest.push({...u, lane: 0});
    }
  }
  return {state, base: skipped ? saved : state, updates: rest};
}
```

Toy arrays omit eager reducers, render-phase updates, optimistic revert lanes, hidden markers, staging and entanglement. Updaters must be pure: replay can repeat them and eager dispatch can execute them before render. [Dispatch][dispatch]

Interruption categories: same root/lanes can resume the current WIP pointer; changed lanes/root or invalidation can prepare a fresh stack from current; alternate objects can be reused after reset; valid bailouts can retain current subtrees; updates remain available for rebasing. Do not claim either universal exact resumption or universal total discard. [Fresh stack][fresh-stack], [concurrent entry][concurrent-entry], [bailout][bailout]

## 8. Search example: type a, then b → input value ab

Assume memoized SlowResults, expensive work in individual rows, first transition unfinished at second event, no suspension/expiration/View Transition.

1. Input task under discrete priority queues input `a` on Sync and query `a` on T1 through transition context.
2. Urgent render skips query update; memoized unchanged Results can bail out. Commit input `a` with previous results. Controlled-event cleanup may flush immediately.
3. Root microtask schedules transition at NormalPriority. Several row units execute; a checkpoint yields; no partial speculative results are published.
4. Later input task queues input `ab` and query `ab`, possibly on T2. Shared query queue can entangle T1/T2.
5. Urgent work replaces the low-priority attempt, renders from current, preserves skipped updates and commits input `ab` with old results.
6. Transition render processes/rebases query replacements in order, calculates `ab`, yields/resumes, then commits finished results. The browser may paint intermediate commits, but no paint-per-commit guarantee exists.

Without a bailout, urgent parent rendering can still execute costly old-query children. A transition is not automatic memoization. If `a` finished before the second event, its results may legitimately have committed. “Old transition canceled” should mean an obsolete attempt/callback/output, not erased queued intent or automatically aborted I/O. A running Row cannot be preempted halfway. [Event priorities][event-priority], [root scheduling][root-scheduler], [queue coupling][hook-entanglement]

## 9. Transitions, Actions and deferred values

`startTransition` saves/restores `ReactSharedInternals.T` around immediate callback invocation. `requestUpdateLane` checks transition context before ordinary event priority. Nested transitions do not create threads/tasks. `useTransition` adds optimistic urgent pending state and a transition completion update; an async return can chain the completion to a thenable. [Public start][start-transition], [request lane][request-lane], [hook transition][hook-transition]

React 19 Actions support async pending lifecycles, but synchronous transition context does not automatically survive `await`; wrap post-await setters as appropriate. Overlapping async Actions can share a pending scope, lane and thenable in `ReactFiberAsyncAction`. Raw requests can resolve out of order; concurrency does not automatically enforce latest-request-wins. Standalone start reports errors differently from the hook's rejected completion path. [Async Actions][async-actions]

```js
// Only a teaching scope: no async Actions or production lane allocation.
let inTransition = false;
function startTransitionToy(fn) {
  const previous = inTransition;
  inTransition = true;
  try { fn(); } finally { inTransition = previous; }
}
```

CPU inside `fn` blocks immediately. Keep controlled input state urgent. `useOptimistic` updates carry a normal Sync lane plus a `revertLane` linked to the transition; this is richer than one low-priority queue. [Optimistic update][optimistic]

`useDeferredValue`: urgent render can retain the prior value and spawn a deferred lane; nonurgent work can adopt the new value; initialValue can cause mount deferral. `requestDeferredLane` chooses deferred transition/Offscreen work and marks DidDefer; Deferred marker/entanglements prevent waterfalls. No fixed timer, debounce guarantee or automatic request deduplication. Suspended follow-up can retain existing content. [Hook][deferred-hook], [deferred request][request-deferred], [root marker][deferred-mark]

## 10. Render, reconciliation and commit

Render executes components, processes queues/context, reconciles identity and records flags. Mount completion can create detached DOM nodes and assemble detached children. Existing host updates mark work; current DOM property updates occur in commit. Hydration, resources and singleton/hoistable features require specialized caveats. “No DOM APIs during render” is false; “no progressive ordinary UI publication during candidate rendering” is the useful rule. [Host completion][host-complete], [host update marking][host-update]

Keys/types/parent position guide reuse. Array matching records placements, moves and deletions without guaranteeing a globally minimal edit script. `subtreeFlags` summarizes effect work; `childLanes` summarizes pending descendant render work. Parent bailout may still traverse an updated descendant. [Reconciliation][child-reconcile], [bailout][bailout], [aggregation][bubble]

Ordinary commit: before-mutation snapshots → synchronous mutation/cleanup/ref detachment → `root.current = finishedWork` → layout effects/lifecycles/ref attachment → spawned/passive scheduling. Each ordinary mutation/layout traversal is unsliced. `completeRootWhenReady` can delay entry for resources. View Transition DOM integration can await fonts/images between mutation and layout; pending-commit guards constrain conflicting root work. This is asynchronous orchestration, not progressive Fiber commits. [Commit readiness][commit-ready], [phase orchestration][commit-orchestration], [current/layout][mutation-layout], [View Transition host][dom-view-transition]

A long render does not imply large DOM changes. A cheap render can demand a huge commit. React CPU, DOM mutation, layout effects, style recalculation, layout, paint and compositing are distinct costs. Concurrency cannot make 20,000 insertions or a huge layout intrinsically cheap.

## 11. Suspense and hidden trees

Supported render reads suspend; arbitrary effect fetches do not. `use(promise)` uses `trackUsedThenable`: fulfilled returns, rejected errors, pending stores the thenable and throws internal `SuspenseException`. WorkLoop retrieves it, classifies the suspension, captures at the nearest eligible handler and unwinds. Legacy raw thenable throws are a separate path. [Thenables][thenables], [throw handling][handle-throw], [capture][throw]

Root ping listeners are deduplicated by wakeable/lane set. Settlement marks lanes pinged and schedules work; committed fallback boundaries also have retry listeners/lane handling. Retrying re-executes React work, not a saved component call stack. Stable promise identity/cache matters. Rejection eventually enters error handling, not perpetual loading. [Ping][ping], [boundary effects][commit-work]

Already revealed content may remain during a suspending transition; new nested boundaries may still show fallback. Urgent suspension may hide prior content. Initial never-committed mounts differ from retained committed trees. React 19 prioritizes fallback readiness and then prewarms sibling work; warm lanes help track exploration. Suspense primary content uses Offscreen machinery. SuspenseList remains outside stable exports.

```js
// Concept only: production uses Fiber handlers, internal sentinels and lanes.
try { return render(); }
catch (x) {
  if (!x || typeof x.then !== 'function') throw x;
  x.then(scheduleRetry, scheduleRetry);
  return transition && hasCommittedContent ? previousContent : fallback;
}
```

A real teaching helper should deduplicate listeners and cache the promise. This snippet lacks nested capture, unwinding, root/commit listener distinctions, retry policies, hidden trees, prewarming and hydration.

Activity is stable, with its own Fiber plus internal Offscreen child. Hidden mode retains state/host content, disconnects effects and allows lower-priority background work. Reveal reconnects effects. Hidden is not unmounted or cost-free. ViewTransition is stable; gesture features and public SuspenseList are not. [Activity processing][activity], [Offscreen][offscreen], [exports][exports]

## 12. Purity, effects and external stores

Render-side external mutation survives even if UI is abandoned, and repeats on restart. Pure local construction is fine; externally observable writes need the appropriate event/Action/effect lifecycle. Strict Mode's development replay/setup-cleanup checks expose mistakes but do not exhaustively simulate scheduling or imply production always renders twice.

Effects run for committed work. Aborted candidates do not execute their effect setups. Layout effects participate in synchronous commit and can delay paint. Insertion effects support style insertion before layout reads. Passive cleanup/setup can be scheduled later or flushed before paint, including Sync-lane paths; “useEffect always after paint” is false. Hiding/revealing retained trees adds reconnect behavior. [Commit effects][commit-effects], [spawned/sync passive handling][spawned], [passive traversal][passive]

Tearing: A reads X; yield; store becomes Y; B reads Y; publishing both would be inconsistent. `useSyncExternalStore` reads stable cached snapshots, records consistency checks on applicable nonblocking paths, validates before commit, and triggers blocking rerender when values differ. Subscriptions/post-render checks can force Sync updates. Object.is identity must accurately represent changes. Transition-wrapping an external mutation does not add multiversion snapshots. [Store hook][external-store], [precommit verification][store-check], [retry gate][work-gate], [design RFC](https://github.com/reactjs/rfcs/blob/main/text/0214-use-sync-external-store.md)

## 13. SSR/hydration and version evolution

Fizz server work uses requests/tasks/segments and Suspense boundaries, not the browser Fiber/MessageChannel loop. It can stream a shell/fallback and later boundary content/instructions. `renderSuspenseBoundary`, `retryTask`, `startWork`, `startFlowing` are key entry points. [Boundary][fizz-boundary], [retry][fizz-retry], [flow][fizz-flow]

Client hydration matches server nodes/markers and treats dehydrated boundaries as schedulable units. Event priority can trigger hydration. Current discrete capture paths attempt synchronous hydration and may stop propagation; continuous events have queue/coalescing paths. Do not say every blocked event is universally replayed. 19.3 `use(browser())` supports intentionally browser-rendered subtrees under Suspense. [Hydration][hydration], [dehydrated boundary][dehydrated], [event path][event-hydration], [browser API](https://react.dev/reference/react-dom/browser)

History: stack reconciler → Fiber (React 16) → expiration-time models/Scheduler → lanes → React 18 concurrent features/streaming hydration → React 19 Actions/use/prewarming → 19.2 Activity/Performance Tracks/partial prerender-resume → 19.3 independent transitions/View Transitions/browser API/Fragment refs. Treat older `expirationTime`, `nextEffect`, default requestIdleCallback, all-transitions-batched and one-stack-commit explanations as version-sensitive. Native/internal forks and gated tests are separate evidence.

## 14. Performance, profiling and teaching constraints

| Bottleneck | Concurrency outcome |
| --- | --- |
| One 100 ms component | Cannot slice the call; optimize/offload computation |
| Many small Fibers | Can yield between units; parent/reconciliation/completion still indivisible |
| 20,000 DOM insertions | Commit/browser cost remains; reduce node count |
| Large layout/paint | Browser work dominates; inspect CSS, invalidation and reads |
| Repeatedly interrupted typing | Better urgent responsiveness can cost more CPU and slower final completion |

Use memoization, state localization, virtualization, pagination, algorithmic improvement, caching or Workers according to the bottleneck. `flushSync` forces relevant work and reduces flexibility; it is not a general optimization. Responsiveness, final-result latency, CPU and throughput must be measured separately.

DevTools Profiler/Profiler callbacks primarily describe committed component work; browser traces capture abandoned CPU and host timing. React Performance Tracks in development/profiling builds align Blocking/Transition/Suspense/Idle and component activity with the browser timeline; ordinary production builds do not expose them by default. Identify input delay, urgent render/commit, interrupted transition, final commit, passive work and browser layout/paint separately. Long-task thresholds are diagnostics, not guarantees. [Tracks](https://react.dev/reference/dev-tools/react-performance-tracks), [Chrome Performance](https://developer.chrome.com/docs/devtools/performance)

The companion mini-renderer has Fiber traversal, current/alternate storage, two toy lanes, MessageChannel scheduler, microtask root coordination, persistent rebase queue, query memoization and synchronous final-snapshot commit. Separate helpers demonstrate Suspense and store consistency. It excludes production hooks, lane groups/entanglement, hydration, multi-root policy and View Transitions. Nine deterministic behavioral checks pass; actual browser visual execution and upstream React suites were not run. The teaching demo is not a production React benchmark.

## 15. Essential teaching statements

Fiber stores work; it does not schedule by itself. MessageChannel knows nothing about transitions. Input handlers never splice into an occupied component call stack. A yield is an opportunity, not a promised paint. Lane priority and Scheduler priority are distinct. Update ordering survives skipped work through rebasing. Abandoned output is not erased intent. Independent transitions are not threads. Memoization is needed to protect the urgent path in the usual search demo. Suspense controls availability/reveal, not just spinners. Rendering is speculative; ordinary publication is coordinated. Async commit orchestration does not make mutation loops preemptible. External stores require consistency validation. A transition can improve responsiveness while increasing total CPU.

## Primary source URLs

All source links below are immutable and include the repository file and relevant line range. They are sufficient to reconstruct the implementation claims without the full dossier.

- [packages/react-reconciler/src/ReactFiberBeginWork.js · mountActivityChildren; updateActivityComponent · L898–1255](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberBeginWork.js#L898-L1255)
- [packages/react-reconciler/src/ReactFiberAsyncAction.js · entangleAsyncAction and scope completion · L37–139](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberAsyncAction.js#L37-L139)
- [packages/react-reconciler/src/ReactFiberBeginWork.js · bailoutOnAlreadyFinishedWork · L3826–3865](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberBeginWork.js#L3826-L3865)
- [packages/react-reconciler/src/ReactFiberLane.js · blocking and expired lane predicates · L684–711](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberLane.js#L684-L711)
- [packages/react-reconciler/src/ReactFiberCompleteWork.js · bubbleProperties · L793–920](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberCompleteWork.js#L793-L920)
- [packages/react-reconciler/src/ReactChildFiber.js · reconcileChildrenArray and related matching · L1177–1535](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactChildFiber.js#L1177-L1535)
- [packages/react-reconciler/src/ReactFiberClassUpdateQueue.js · processUpdateQueue · L487–680](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberClassUpdateQueue.js#L487-L680)
- [packages/react-reconciler/src/ReactFiberCommitEffects.js · effect setup/cleanup; class lifecycles and refs · L97–921](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberCommitEffects.js#L97-L921)
- [packages/react-reconciler/src/ReactFiberWorkLoop.js · commitRoot and phase orchestration · L3725–3921](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L3725-L3921)
- [packages/react-reconciler/src/ReactFiberWorkLoop.js · completeRootWhenReady · L1578–1700](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L1578-L1700)
- [packages/react-reconciler/src/ReactFiberCommitWork.js · attachSuspenseRetryListeners; mutation and layout traversals · L1978–3115](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberCommitWork.js#L1978-L3115)
- [packages/react-reconciler/src/ReactFiberWorkLoop.js · completeUnitOfWork · L3368–3431](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L3368-L3431)
- [packages/react-reconciler/src/ReactFiberWorkLoop.js · renderRootConcurrent · L2779–3053](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L2779-L3053)
- [packages/react-reconciler/src/ReactFiberConcurrentUpdates.js · finishQueueingConcurrentUpdates; enqueueConcurrentHookUpdate; ancestor marking · L39–264](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberConcurrentUpdates.js#L39-L264)
- [packages/react-dom-bindings/src/events/ReactDOMUpdateBatching.js · finishEventHandler; controlled restoration · L28–59](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-dom-bindings/src/events/ReactDOMUpdateBatching.js#L28-L59)
- [packages/react-reconciler/src/ReactFiberHooks.js · mount/updateDeferredValueImpl · L3028–3109](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L3028-L3109)
- [packages/react-reconciler/src/ReactFiberLane.js · markSpawnedDeferredLane; markRootEntangled · L997–1057](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberLane.js#L997-L1057)
- [packages/react-reconciler/src/ReactFiberBeginWork.js · updateDehydratedSuspenseComponent · L2972–3240](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberBeginWork.js#L2972-L3240)
- [packages/react-reconciler/src/ReactFiberHooks.js · dispatchSetState; dispatchSetStateInternal · L3626–3726](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L3626-L3726)
- [packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js · startViewTransition callbacks and readiness waits · L2167–2421](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js#L2167-L2421)
- [packages/react-reconciler/src/ReactFiberLane.js · getEntangledLanes · L427–475](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberLane.js#L427-L475)
- [packages/react-dom-bindings/src/events/ReactDOMEventListener.js · blocked event and synchronous hydration handling · L170–237](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-dom-bindings/src/events/ReactDOMEventListener.js#L170-L237)
- [packages/react-reconciler/src/ReactEventPriorities.js · event/lane priority conversion · L22–67](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactEventPriorities.js#L22-L67)
- [packages/react-dom-bindings/src/events/ReactDOMEventListener.js · priority wrappers and getEventPriority · L98–414](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-dom-bindings/src/events/ReactDOMEventListener.js#L98-L414)
- [packages/react/index.stable.js · stable exports · L10–55](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react/index.stable.js#L10-L55)
- [packages/react-reconciler/src/ReactFiberHooks.js · mount/updateSyncExternalStore; consistency and subscription · L1648–1918](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L1648-L1918)
- [packages/react-reconciler/src/ReactFiber.js · createWorkInProgress; resetWorkInProgress · L323–522](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiber.js#L323-L522)
- [packages/react-reconciler/src/ReactInternalTypes.js · Fiber type · L89–210](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactInternalTypes.js#L89-L210)
- [packages/react-server/src/ReactFizzServer.js · renderSuspenseBoundary · L1474–1665](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-server/src/ReactFizzServer.js#L1474-L1665)
- [packages/react-server/src/ReactFizzServer.js · startWork; startFlowing; stopFlowing · L6370–6496](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-server/src/ReactFizzServer.js#L6370-L6496)
- [packages/react-server/src/ReactFizzServer.js · retryTask; retryRenderTask · L5327–5460](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-server/src/ReactFizzServer.js#L5327-L5460)
- [packages/shared/ReactFeatureFlags.js · stable OSS feature flags · L24–282](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/shared/ReactFeatureFlags.js#L24-L282)
- [packages/react-reconciler/src/ReactFiberWorkLoop.js · prepareFreshStack · L2023–2293](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L2023-L2293)
- [packages/react-reconciler/src/ReactFiberWorkLoop.js · handleThrow · L2302–2435](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L2302-L2435)
- [packages/react-reconciler/src/ReactFiberHooks.js · entangleTransitionUpdate · L3867–3889](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L3867-L3889)
- [packages/react-reconciler/src/ReactFiberHooks.js · updateReducerImpl · L1316–1588](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L1316-L1588)
- [packages/react-reconciler/src/ReactFiberHooks.js · startTransition; mountTransition; updateTransition · L3117–3455](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L3117-L3455)
- [packages/react-reconciler/src/ReactFiberCompleteWork.js · HostComponent mount/update completion · L1374–1454](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberCompleteWork.js#L1374-L1454)
- [packages/react-reconciler/src/ReactFiberCompleteWork.js · updateHostComponent marks work · L463–481](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberCompleteWork.js#L463-L481)
- [packages/react-reconciler/src/ReactFiberHydrationContext.js · hydration entry/reentry and node claiming · L156–573](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHydrationContext.js#L156-L573)
- [packages/react-reconciler/src/ReactFiberLane.js · computeExpirationTime; markStarvedLanesAsExpired · L477–588](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberLane.js#L477-L588)
- [packages/react-reconciler/src/ReactFiberLane.js · lane constants; getHighestPriorityLanes · L41–240](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberLane.js#L41-L240)
- [packages/react-reconciler/src/ReactFiberWorkLoop.js · flushMutationEffects; root.current; flushLayoutEffects · L4009–4151](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L4009-L4151)
- [packages/react-reconciler/src/ReactFiberLane.js · getNextLanes · L249–360](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberLane.js#L249-L360)
- [packages/react-reconciler/src/ReactFiberBeginWork.js · updateOffscreenComponent · L620–896](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberBeginWork.js#L620-L896)
- [packages/react-reconciler/src/ReactFiberHooks.js · dispatchOptimisticSetState and revertLane · L3728–3832](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L3728-L3832)
- [packages/react-reconciler/src/ReactFiberWorkLoop.js · flushPassiveEffects; flushPassiveEffectsImpl · L4691–4830](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L4691-L4830)
- [packages/react-reconciler/src/ReactFiberWorkLoop.js · attachPingListener; pingSuspendedRoot · L4970–5096](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L4970-L5096)
- [packages/react-reconciler/src/ReactFiberWorkLoop.js · requestDeferredLane · L884–921](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L884-L921)
- [packages/react-reconciler/src/ReactFiberWorkLoop.js · requestUpdateLane · L812–868](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L812-L868)
- [packages/react-reconciler/src/ReactFiberRootScheduler.js · performWorkOnRootViaSchedulerTask · L513–605](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberRootScheduler.js#L513-L605)
- [packages/react-reconciler/src/ReactFiberRootScheduler.js · processRootScheduleInMicrotask · L259–348](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberRootScheduler.js#L259-L348)
- [packages/react-reconciler/src/ReactFiberRootScheduler.js · root scheduling entry points · L116–738](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberRootScheduler.js#L116-L738)
- [packages/react-reconciler/src/ReactFiberRootScheduler.js · scheduleTaskForRootDuringMicrotask · L384–508](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberRootScheduler.js#L384-L508)
- [packages/scheduler/index.js · default package export · L1–10](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/index.js#L1-L10)
- [packages/scheduler/src/SchedulerFeatureFlags.js · yield interval and priority timeout constants · L10–18](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/src/SchedulerFeatureFlags.js#L10-L18)
- [packages/scheduler/src/SchedulerMinHeap.js · push; peek; pop; comparator · L10–95](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/src/SchedulerMinHeap.js#L10-L95)
- [packages/scheduler/src/forks/Scheduler.js · shouldYieldToHost; performWorkUntilDeadline; host scheduling · L450–583](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/src/forks/Scheduler.js#L450-L583)
- [packages/scheduler/src/forks/SchedulerPostTask.js · optional postTask Scheduler implementation · L1–239](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/src/forks/SchedulerPostTask.js#L1-L239)
- [packages/scheduler/src/forks/Scheduler.js · unstable_scheduleCallback · L335–427](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/src/forks/Scheduler.js#L335-L427)
- [packages/scheduler/src/forks/Scheduler.js · advanceTimers; flushWork; workLoop · L103–260](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/src/forks/Scheduler.js#L103-L260)
- [packages/react-reconciler/src/ReactFiberWorkLoop.js · flushSpawnedWork; sync passive flushing · L4154–4335](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L4154-L4335)
- [packages/react/src/ReactStartTransition.js · public startTransition · L45–117](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react/src/ReactStartTransition.js#L45-L117)
- [packages/react-reconciler/src/ReactFiberWorkLoop.js · isRenderConsistentWithExternalStores · L1703–1759](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L1703-L1759)
- [packages/react-reconciler/src/ReactFiberThenable.js · SuspenseException; trackUsedThenable; getSuspendedThenable · L55–395](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberThenable.js#L55-L395)
- [packages/react-reconciler/src/ReactFiberThrow.js · throwException capture and wakeable handling · L364–548](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberThrow.js#L364-L548)
- [packages/react-reconciler/src/ReactFiberRootScheduler.js · requestTransitionLane · L698–724](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberRootScheduler.js#L698-L724)
- [packages/react-reconciler/src/ReactFiberWorkLoop.js · performWorkOnRoot; sync/concurrent policy and store retry · L1137–1243](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L1137-L1243)
- [packages/react-reconciler/src/ReactFiberWorkLoop.js · work-loop selection; workLoopConcurrentByScheduler; performUnitOfWork · L3007–3123](https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L3007-L3123)

[activity]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberBeginWork.js#L898-L1255
[async-actions]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberAsyncAction.js#L37-L139
[bailout]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberBeginWork.js#L3826-L3865
[blocking-lanes]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberLane.js#L684-L711
[bubble]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberCompleteWork.js#L793-L920
[child-reconcile]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactChildFiber.js#L1177-L1535
[class-queue]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberClassUpdateQueue.js#L487-L680
[commit-effects]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberCommitEffects.js#L97-L921
[commit-orchestration]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L3725-L3921
[commit-ready]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L1578-L1700
[commit-work]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberCommitWork.js#L1978-L3115
[complete-unit]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L3368-L3431
[concurrent-entry]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L2779-L3053
[concurrent-queues]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberConcurrentUpdates.js#L39-L264
[controlled-batching]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-dom-bindings/src/events/ReactDOMUpdateBatching.js#L28-L59
[deferred-hook]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L3028-L3109
[deferred-mark]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberLane.js#L997-L1057
[dehydrated]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberBeginWork.js#L2972-L3240
[dispatch]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L3626-L3726
[dom-view-transition]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js#L2167-L2421
[entangled-lanes]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberLane.js#L427-L475
[event-hydration]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-dom-bindings/src/events/ReactDOMEventListener.js#L170-L237
[event-lane]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactEventPriorities.js#L22-L67
[event-priority]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-dom-bindings/src/events/ReactDOMEventListener.js#L98-L414
[exports]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react/index.stable.js#L10-L55
[external-store]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L1648-L1918
[fiber-copy]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiber.js#L323-L522
[fiber-type]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactInternalTypes.js#L89-L210
[fizz-boundary]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-server/src/ReactFizzServer.js#L1474-L1665
[fizz-flow]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-server/src/ReactFizzServer.js#L6370-L6496
[fizz-retry]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-server/src/ReactFizzServer.js#L5327-L5460
[flags]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/shared/ReactFeatureFlags.js#L24-L282
[fresh-stack]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L2023-L2293
[handle-throw]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L2302-L2435
[hook-entanglement]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L3867-L3889
[hook-queue]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L1316-L1588
[hook-transition]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L3117-L3455
[host-complete]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberCompleteWork.js#L1374-L1454
[host-update]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberCompleteWork.js#L463-L481
[hydration]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHydrationContext.js#L156-L573
[lane-expiration]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberLane.js#L477-L588
[lane-groups]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberLane.js#L41-L240
[mutation-layout]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L4009-L4151
[next-lanes]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberLane.js#L249-L360
[offscreen]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberBeginWork.js#L620-L896
[optimistic]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberHooks.js#L3728-L3832
[passive]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L4691-L4830
[ping]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L4970-L5096
[request-deferred]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L884-L921
[request-lane]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L812-L868
[root-callback]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberRootScheduler.js#L513-L605
[root-microtask]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberRootScheduler.js#L259-L348
[root-scheduler]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberRootScheduler.js#L116-L738
[root-task]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberRootScheduler.js#L384-L508
[scheduler-entry]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/index.js#L1-L10
[scheduler-flags]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/src/SchedulerFeatureFlags.js#L10-L18
[scheduler-heap]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/src/SchedulerMinHeap.js#L10-L95
[scheduler-host]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/src/forks/Scheduler.js#L450-L583
[scheduler-posttask]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/src/forks/SchedulerPostTask.js#L1-L239
[scheduler-schedule]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/src/forks/Scheduler.js#L335-L427
[scheduler-work]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/scheduler/src/forks/Scheduler.js#L103-L260
[spawned]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L4154-L4335
[start-transition]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react/src/ReactStartTransition.js#L45-L117
[store-check]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L1703-L1759
[thenables]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberThenable.js#L55-L395
[throw]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberThrow.js#L364-L548
[transition-lane]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberRootScheduler.js#L698-L724
[work-gate]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L1137-L1243
[work-loops]: https://github.com/react/react/blob/1d34f91dfde6bba84d08b683aaba164c7194dacb/packages/react-reconciler/src/ReactFiberWorkLoop.js#L3007-L3123
