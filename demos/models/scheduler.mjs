// Educational reconstruction: a queue of small work units, no React imports.
// React's Scheduler also has priority/deadline heaps and task continuations.
export function scheduleUnits(
  units,
  { postTask, now = () => performance.now(), budgetMs = 5, onSlice = () => {}, onDone = () => {} },
) {
  // Saved between callbacks: the index of the first unit we have not run yet.
  let nextUnitIndex = 0;
  let cancelled = false;

  function workLoop() {
    if (cancelled) return;
    // A fresh budget for this slice. Tests can inject a controlled clock via now.
    const deadline = now() + budgetMs;
    const firstUnitIndex = nextUnitIndex;
    // Always finish one unit. A running function cannot be preempted.
    do {
      if (nextUnitIndex === units.length) break;
      units[nextUnitIndex]();
      nextUnitIndex++;
    } while (!cancelled && nextUnitIndex < units.length && now() < deadline);

    if (cancelled) return;
    // The end index is exclusive: [0, 2) means units at indices 0 and 1 ran.
    onSlice({ firstUnitIndex, nextUnitIndex });
    // Return after enqueueing the continuation; do not call workLoop recursively.
    if (nextUnitIndex < units.length) postTask(workLoop);
    else onDone();
  }

  // postTask is our injected enqueue function, NOT the browser scheduler.postTask API.
  postTask(workLoop);
  return () => {
    // A queued callback may still arrive, but it will exit without doing work.
    cancelled = true;
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
      channel.port1.close();
      channel.port2.close();
    },
  };
}
