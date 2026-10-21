// Educational reconstruction: a queue of small work units, no React imports.
// React's Scheduler also has priority/deadline heaps and task continuations.
export function scheduleUnits(
  units,
  { postTask, now = () => performance.now(), budgetMs = 5, onSlice = () => {}, onDone = () => {} },
) {
  // Saved between callbacks: the index of the first unit we have not run yet.
  let nextUnitIndex = 0;
  let cancelled = false;

  function workLoop(idleDeadline) {
    if (cancelled) return;
    // A fresh budget for this slice. Tests can inject a controlled clock via now.
    const deadline = now() + budgetMs;
    const firstUnitIndex = nextUnitIndex;
    // Idle mode also respects the browser's estimate; other modes have no idleDeadline.
    while (
      !cancelled &&
      nextUnitIndex < units.length &&
      (!idleDeadline || idleDeadline.timeRemaining() > 0)
    ) {
      // Finish the whole unit, even if it overruns either budget.
      units[nextUnitIndex]();
      nextUnitIndex++;
      if (now() >= deadline) break;
    }

    if (cancelled) return;
    // The end index is exclusive: [0, 2) means units at indices 0 and 1 ran.
    if (nextUnitIndex > firstUnitIndex) onSlice({ firstUnitIndex, nextUnitIndex });
    // Return after enqueueing the continuation; do not call workLoop recursively.
    if (nextUnitIndex < units.length) {
      postTask(workLoop);
    } else {
      onDone();
    }
  }

  // postTask is our injected enqueue function, NOT the browser scheduler.postTask API.
  postTask(workLoop);
  return () => {
    // A queued callback may still arrive, but it will exit without doing work.
    cancelled = true;
  };
}

// Same interface as the MessageChannel helper; this demo has one pending continuation.
export function createIdleTasks() {
  let handle;
  return {
    postTask(callback) {
      // No timeout: wait for idle time and pass its deadline to the callback.
      handle = requestIdleCallback(callback);
    },
    close() {
      if (handle !== undefined) cancelIdleCallback(handle);
    },
  };
}

// One message delivers one host callback. Caller closes the channel after use.
export function createHostTasks() {
  const channel = new MessageChannel();
  const callbacks = [];
  // Receiving a message runs one queued callback in a later browser task.
  channel.port1.onmessage = () => callbacks.shift()?.();
  return {
    postTask(callback) {
      // Keep the function here; the message is only a signal to run it.
      callbacks.push(callback);
      channel.port2.postMessage(null);
    },
    close() {
      // Discard pending callbacks and release both ports when a run ends.
      callbacks.length = 0;
      // 2 channels because one sends and the other receives
      channel.port1.close();
      channel.port2.close();
    },
  };
}
