// Educational reconstruction, not React source or a compatible renderer.
// Fixed Search/Input/Results/Row tree; one root update queue; one transition lane.
// See README.md for deliberate differences from React 19.3.0.
export const NoLane = 0, SyncLane = 1, TransitionLane = 2;
export const mergeLanes = (a, b) => a | b;
export const getHighestPriorityLane = lanes => lanes & -lanes;
export function getNextLanes(root) {
  return getHighestPriorityLane(root.pendingLanes & ~root.suspendedLanes);
}
let transitionDepth = 0;
export function startTransition(action) {
  transitionDepth++;
  try { action(); } finally { transitionDepth--; }
}

// Pure queue processing. Calling this never consumes committed updates.
export function processQueue(baseState, updates, renderLanes) {
  let state = baseState, nextBaseState = baseState, skipped = false;
  const baseQueue = [];
  for (const update of updates) {
    const include = update.lane === NoLane ||
      (update.lane & renderLanes) === update.lane;
    if (!include) {
      if (!skipped) nextBaseState = state;
      skipped = true;
      baseQueue.push({...update});
    } else {
      state = update.action(state);
      if (skipped) baseQueue.push({...update, lane: NoLane});
    }
  }
  return {state, baseState: skipped ? nextBaseState : state, baseQueue};
}

// 43 lines: FIFO host scheduler with cancellation and continuations.
// Deliberately omits React Scheduler's heaps, deadlines and five priorities.
export function createScheduler({
  now = () => performance.now(),
  postTask, budgetMs = 5,
} = {}) {
  let close = () => {};
  if (!postTask) {
    const channel = new MessageChannel();
    const posted = [];
    channel.port1.onmessage = () => posted.shift()?.();
    postTask = callback => { posted.push(callback); channel.port2.postMessage(0); };
    close = () => { channel.port1.close(); channel.port2.close(); };
  }
  const queue = [];
  let posted = false, deadline = 0;
  const shouldYield = () => now() >= deadline;
  function request() {
    if (!posted && queue.length) { posted = true; postTask(workLoop); }
  }
  function workLoop() {
    posted = false;
    deadline = now() + budgetMs;
    try {
      while (queue.length) {
        const task = queue[0];
        if (!task.callback) { queue.shift(); continue; }
        if (shouldYield()) break;
        const callback = task.callback;
        task.callback = null;
        const continuation = callback();
        if (typeof continuation === 'function' && !task.cancelled) {
          task.callback = continuation;
          break; // A continuation always gets a fresh host task.
        }
        queue.shift();
      }
    } finally { request(); }
  }
  function schedule(callback) {
    const task = {callback, cancelled: false};
    queue.push(task); request(); return task;
  }
  function cancel(task) { if (task) { task.cancelled = true; task.callback = null; } }
  return {schedule, cancel, shouldYield, close};
}

export function createFiber(tag, pendingProps, key = null) {
  return {
    tag, key, elementType: tag, type: tag, stateNode: null,
    return: null, child: null, sibling: null, index: 0, ref: null,
    pendingProps, memoizedProps: null, memoizedState: null,
    updateQueue: null, dependencies: null, flags: 0, subtreeFlags: 0,
    deletions: null, lanes: 0, childLanes: 0, alternate: null,
    output: null, bailedOut: false,
  };
}
export function createWorkInProgress(current, props) {
  let work = current.alternate;
  if (!work) {
    work = createFiber(current.tag, props, current.key);
    work.alternate = current; current.alternate = work;
  }
  Object.assign(work, {
    pendingProps: props, memoizedProps: current.memoizedProps,
    memoizedState: current.memoizedState, output: current.output,
    stateNode: current.stateNode, updateQueue: current.updateQueue,
    child: current.child, lanes: current.lanes, childLanes: current.childLanes,
    flags: 0, subtreeFlags: 0, deletions: null, bailedOut: false,
    return: null, sibling: null,
  });
  return work;
}
function linkChildren(parent, descriptions) {
  let old = parent.alternate?.child ?? null, previous = null;
  parent.child = null;
  for (let i = 0; i < descriptions.length; i++) {
    const [tag, props, key = null] = descriptions[i];
    const same = old && old.tag === tag && old.key === key;
    const child = same ? createWorkInProgress(old, props) : createFiber(tag, props, key);
    child.return = parent; child.index = i;
    if (previous) previous.sibling = child; else parent.child = child;
    previous = child;
    old = old?.sibling ?? null;
  }
}
export function beginWork(fiber, root) {
  const props = fiber.pendingProps;
  root.emit('begin', {fiber: fiber.tag, key: fiber.key});
  switch (fiber.tag) {
    case 'Search':
      linkChildren(fiber, [['Input', {value: props.input}], ['Results', {query: props.query}]]);
      return fiber.child;
    case 'Input': fiber.output = props.value; return null;
    case 'Results': {
      // Explicit query-only memoization, analogous to memo(SlowResults).
      const old = fiber.alternate;
      if (old && old.memoizedProps.query === props.query && root.memoResults) {
        fiber.bailedOut = true;
        fiber.child = old.child; fiber.output = old.output;
        root.emit('bailout', {fiber: 'Results', query: props.query});
        return null;
      }
      // Like React reconciliation, this loop itself cannot yield.
      linkChildren(fiber, Array.from({length: root.rowCount}, (_, i) =>
        ['Row', {query: props.query, index: i}, String(i)]));
      return fiber.child;
    }
    case 'Row':
      // One whole call is indivisible from the scheduler's perspective.
      fiber.output = root.renderRow(props);
      return null;
    default: throw new Error('Unknown educational Fiber tag');
  }
}
export function completeWork(fiber, root) {
  if (fiber.tag === 'Results' && !fiber.bailedOut) {
    const rows = [];
    for (let child = fiber.child; child; child = child.sibling) rows.push(child.output);
    fiber.output = rows;
  }
  if (fiber.tag === 'Search') fiber.output = {
    input: fiber.child.output,
    query: fiber.pendingProps.query,
    rows: fiber.child.sibling.output,
  };
  // Model an effect marker; the host adapter applies the final snapshot at commit.
  fiber.flags = fiber.output !== fiber.alternate?.output ? 1 : 0;
  if (!fiber.bailedOut) {
    for (let child = fiber.child; child; child = child.sibling)
      fiber.subtreeFlags |= child.flags | child.subtreeFlags;
  }
  fiber.memoizedProps = fiber.pendingProps;
  root.emit('complete', {fiber: fiber.tag, key: fiber.key});
}
export function completeUnitOfWork(unit, root) {
  let fiber = unit;
  while (fiber) {
    completeWork(fiber, root);
    if (fiber.sibling) return fiber.sibling;
    fiber = fiber.return;
  }
  return null;
}
export function performUnitOfWork(unit, root) {
  return beginWork(unit, root) || completeUnitOfWork(unit, root);
}

export function createMiniConcurrentRoot({
  scheduler = createScheduler(), queueMicrotask: enqueueMicrotask = globalThis.queueMicrotask,
  now = () => performance.now(), rowCount = 120,
  renderRow = ({query, index}) => `${query || 'empty'} · row ${index + 1}`,
  commit = () => {}, onEvent = () => {}, memoResults = true,
} = {}) {
  const initial = {input: '', query: ''};
  const root = {
    current: createFiber('Search', initial), baseState: initial, baseQueue: [], pending: [],
    pendingLanes: 0, suspendedLanes: 0, draft: null, nextUnit: null,
    callback: null, microtaskScheduled: false, rowCount, renderRow, memoResults,
    generation: 0, committedGeneration: 0, lastSnapshot: null,
    emit(type, detail = {}) { onEvent({type, time: now(), generation: root.generation, ...detail}); },
  };
  function refreshLanes() {
    root.pendingLanes = [...root.baseQueue, ...root.pending].reduce((n, u) => n | u.lane, 0);
  }
  function prepare(lanes) {
    if (root.draft) root.emit('abandon', {lanes: root.draft.lanes});
    const pendingCount = root.pending.length;
    const queueResult = processQueue(root.baseState,
      [...root.baseQueue, ...root.pending.slice(0, pendingCount)], lanes);
    root.generation++;
    const work = createWorkInProgress(root.current, queueResult.state);
    root.draft = {work, lanes, queueResult, pendingCount};
    root.nextUnit = work;
    root.emit('render-start', {lanes, state: queueResult.state});
  }
  function commitRoot() {
    const draft = root.draft;
    // No yields or awaits within this synchronous mutation adapter.
    root.emit('commit-start', {lanes: draft.lanes});
    commit(draft.work.output);
    root.current = draft.work;
    root.baseState = draft.queueResult.baseState;
    root.baseQueue = draft.queueResult.baseQueue;
    root.pending.splice(0, draft.pendingCount); // Keep updates received after render began.
    root.lastSnapshot = draft.work.output;
    root.committedGeneration = root.generation;
    root.draft = null; root.nextUnit = null;
    refreshLanes();
    root.emit('commit-end', {lanes: draft.lanes, state: root.current.pendingProps});
  }
  function perform(lanes, sync) {
    if (!root.draft || root.draft.lanes !== lanes) prepare(lanes);
    while (root.nextUnit && (sync || !scheduler.shouldYield()))
      root.nextUnit = performUnitOfWork(root.nextUnit, root);
    if (!root.nextUnit) commitRoot();
    else root.emit('yield', {lanes, next: root.nextUnit.tag});
  }
  function concurrentCallback() {
    const lanes = getNextLanes(root);
    if (!lanes) { root.callback = null; return null; }
    perform(lanes, lanes === SyncLane);
    if (root.draft) return concurrentCallback;
    root.callback = null;
    ensureRootIsScheduled();
    return null;
  }
  function processRootScheduleInMicrotask() {
    root.microtaskScheduled = false;
    if (getNextLanes(root) === SyncLane) {
      scheduler.cancel(root.callback); root.callback = null;
      perform(SyncLane, true);
    }
    if (getNextLanes(root) && !root.callback)
      root.callback = scheduler.schedule(concurrentCallback);
  }
  function ensureRootIsScheduled() {
    if (!root.microtaskScheduled) {
      root.microtaskScheduled = true;
      enqueueMicrotask(processRootScheduleInMicrotask);
    }
  }
  function setState(action, lane = transitionDepth ? TransitionLane : SyncLane) {
    root.pending.push({action, lane}); refreshLanes();
    root.emit('update', {lane}); ensureRootIsScheduled();
  }
  function input(value) {
    root.emit('input', {value});
    setState(s => ({...s, input: value}));
    startTransition(() => setState(s => ({...s, query: value})));
  }
  function mount() { setState(s => s, SyncLane); }
  return {root, input, setState, mount, ensureRootIsScheduled, scheduler};
}
