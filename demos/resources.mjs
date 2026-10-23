// Controlled, stable promises for the REAL React use(promise) example.
// These are created by setup/event handlers, never by a component render.
export function createRequest(label) {
  // This is a beautiful replacement for good old Promise constructor
  // let resolvePromise;
  // let rejectPromise;
  // const request = new Promise((resolve, reject) => {
  //   resolvePromise = resolve;
  //   rejectPromise = reject;
  // });
  const { promise, resolve, reject } = Promise.withResolvers();

  const request = { label, status: 'pending', promise };

  // The original promise still rejects for React's error boundary.
  request.promise.catch(() => {});

  request.resolve = () => {
    if (request.status !== 'pending') return;
    request.status = 'fulfilled';
    resolve(label);
  };

  request.reject = () => {
    if (request.status !== 'pending') return;
    request.status = 'rejected';
    reject(new Error('Could not load ' + label));
  };

  return request;
}

export function createScenario(initiallyPending = false) {
  const initial = createRequest('Article A');
  if (!initiallyPending) initial.resolve();
  return { initial };
}
