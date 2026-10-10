// Educational reconstruction, not a React component or production fetching API.
// Our tiny renderer calls children() itself; ordinary JSX does not do that.
export function createSuspenseBoundary(scheduleRetry) {
  const listening = new WeakSet();
  let current;
  let hasRevealedContent = false;

  function MiniSuspense({ children, fallback, transition = false }) {
    try {
      return { status: 'content', content: children() };
    } catch (value) {
      const isThenable =
        value !== null &&
        (typeof value === 'object' || typeof value === 'function') &&
        typeof value.then === 'function';
      if (!isThenable) throw value; // Errors belong to error handling.

      if (!listening.has(value)) {
        listening.add(value);
        const ping = () => {
          listening.delete(value);
          scheduleRetry(); // Notification only: no render or commit here.
        };
        value.then(ping, ping);
      }

      return transition && hasRevealedContent
        ? { status: 'retained', content: current }
        : { status: 'fallback', content: fallback };
    }
  }

  function commit(candidate) {
    if (candidate.status === 'retained') return current;
    current = candidate.content;
    hasRevealedContent = candidate.status === 'content';
    return current;
  }

  // Dropping a candidate is enough to discard it: rendering never changes current.
  return { MiniSuspense, commit, getCurrent: () => current };
}
