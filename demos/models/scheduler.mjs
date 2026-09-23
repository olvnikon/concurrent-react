// Educational reconstruction: a queue of small work units, no React imports.
// React's Scheduler also has priority/deadline heaps and task continuations.
export function scheduleUnits(units, {
  postTask, now = () => performance.now(), budgetMs = 5,
  onSlice = () => {}, onDone = () => {},
}) {
  let next = 0;
  let cancelled = false;

  function workLoop() {
    if (cancelled) return;
    const deadline = now() + budgetMs;
    const first = next;
    // Always finish one unit. A running function cannot be preempted.
    do {
      if (next === units.length) break;
      units[next++]();
    } while (!cancelled && next < units.length && now() < deadline);

    if (cancelled) return;
    onSlice({first, next});
    if (next < units.length) postTask(workLoop);
    else onDone();
  }

  postTask(workLoop);
  return () => { cancelled = true; };
}

// One message delivers one host callback. Caller closes the channel after use.
export function createHostTasks() {
  const channel = new MessageChannel();
  const callbacks = [];
  channel.port1.onmessage = () => callbacks.shift()?.();
  return {
    postTask(callback) {
      callbacks.push(callback);
      channel.port2.postMessage(null);
    },
    close() {
      callbacks.length = 0;
      channel.port1.close();
      channel.port2.close();
    },
  };
}
