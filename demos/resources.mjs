// Controlled, stable promises for the REAL React use(promise) example.
// These are created by setup/event handlers, never by a component render.
export function createRequest(label) {
  let resolvePromise, rejectPromise;
  const request = { label, status: 'pending' };
  request.promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  // The original promise still rejects for React's error boundary.
  request.promise.catch(() => {});
  request.resolve = () => {
    if (request.status !== 'pending') return;
    request.status = 'fulfilled';
    resolvePromise(label);
  };
  request.reject = () => {
    if (request.status !== 'pending') return;
    request.status = 'rejected';
    rejectPromise(new Error('Could not load ' + label));
  };
  return request;
}
export function createScenario(initiallyPending = false) {
  const initial = createRequest('Article A');
  if (!initiallyPending) initial.resolve();
  return { initial };
}
