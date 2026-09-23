// Teaching-only mechanisms. These are not production Suspense integration APIs.
export function createResource(promise) {
  let status = 'pending', result;
  const wakeable = Promise.resolve(promise).then(
    value => { status = 'fulfilled'; result = value; },
    error => { status = 'rejected'; result = error; },
  );
  return {read() {
    if (status === 'pending') throw wakeable;
    if (status === 'rejected') throw result;
    return result;
  }};
}
export function createBoundary(scheduleRetry) {
  const listening = new WeakSet();
  let committed, hasContent = false;
  return function renderBoundary(render, fallback, {transition = false} = {}) {
    try {
      const content = render();
      committed = content; hasContent = true;
      return {status: 'content', content};
    } catch (value) {
      if (value === null || (typeof value !== 'object' && typeof value !== 'function') ||
          typeof value.then !== 'function') throw value;
      if (!listening.has(value)) {
        listening.add(value);
        const retry = () => { listening.delete(value); scheduleRetry(); };
        value.then(retry, retry);
      }
      return {status: 'suspended', content: transition && hasContent ? committed : fallback};
    }
  };
}
// Simplified store consistency checkpoint; React tracks these checks on Fibers.
export function snapshotsAreConsistent(reads) {
  return reads.every(({getSnapshot, value}) => {
    try { return Object.is(getSnapshot(), value); } catch { return false; }
  });
}
// Effects recorded by an isolated render draft become observable at commit only.
export function commitDraft(draft, host) {
  for (const change of draft.changes) host.apply(change);
  host.current = draft;
  for (const layout of draft.layoutEffects ?? []) layout();
  // Scheduling a later task does NOT guarantee that a paint happened first.
  if (draft.passiveEffects?.length)
    host.schedule(() => { for (const effect of draft.passiveEffects) effect(); });
}
