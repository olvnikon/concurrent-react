import React, { useEffect, useState } from 'react';
import { createSuspenseBoundary } from './models/suspense.mjs';
import { createResource } from '../examples/mechanisms.mjs';
import { createRequest } from './resources.mjs';
import { Source } from './shared.jsx';
import source from './models/suspense.mjs?raw';
import mechanismSource from '../examples/mechanisms.mjs?raw';

function createModel(notify) {
  const model = {
    active: true,
    events: [],
    candidate: null,
    request: null,
    error: null,
    retryQueued: false,
  };
  model.boundary = createSuspenseBoundary(() => {
    if (!model.active) return;
    model.retryQueued = true;
    model.events.push('ping: retry queued; current is unchanged');
    notify();
  });
  model.read = () => 'Article A';
  model.boundary.commit(model.boundary.MiniSuspense({ children: model.read }));
  return model;
}

export default function SuspenseModel() {
  const [, redraw] = useState(0);
  const notify = () => redraw((n) => n + 1);
  const [model, setModel] = useState(() => createModel(notify));
  const [mode, setMode] = useState('urgent');
  useEffect(
    () => () => {
      model.active = false;
    },
    [model],
  );

  function load() {
    model.candidate = null;
    model.request = createRequest('Article B'); // Stable promise, created in an event.
    model.read = createResource(model.request.promise).read;
    model.events.push('resource pending; render has not run yet');
    notify();
  }
  function render() {
    model.retryQueued = false; // The manual driver consumes the retry request.
    model.error = null;
    try {
      model.candidate = model.boundary.MiniSuspense({
        children: model.read,
        fallback: 'Loading article…',
        transition: mode === 'transition',
      });
      model.events.push('render: ' + model.candidate.status + '; current is unchanged');
    } catch (error) {
      model.candidate = null;
      model.error = error.message;
      model.events.push('error escapes Suspense: ' + error.message);
    }
    notify();
  }
  function commit() {
    model.boundary.commit(model.candidate);
    model.events.push('commit: ' + model.boundary.getCurrent());
    model.candidate = null;
    notify();
  }
  function settle(outcome) {
    model.request[outcome]();
    model.events.push('resource ' + outcome + '; notification follows asynchronously');
    notify();
  }
  function reset() {
    model.active = false;
    setModel(createModel(notify));
  }

  const pending = model.request?.status === 'pending';
  const resourceSource = mechanismSource.slice(
    0,
    mechanismSource.indexOf('export function createBoundary'),
  );
  return (
    <section aria-label="Educational Suspense model">
      <h2>Inside a tiny Suspense boundary · educational reconstruction</h2>
      <div className="controls">
        <label>
          Model replacement mode
          <select
            aria-label="Model replacement mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            disabled={!!model.request}
          >
            <option value="urgent">Urgent</option>
            <option value="transition">Transition</option>
          </select>
        </label>
        <button onClick={load} disabled={!!model.request}>
          Create pending B
        </button>
        <button onClick={render}>Render / Retry model</button>
        <button onClick={commit} disabled={!model.candidate}>
          Commit candidate
        </button>
        <button
          className="secondary"
          onClick={() => {
            model.candidate = null;
            model.events.push('discard: current is unchanged');
            notify();
          }}
          disabled={!model.candidate}
        >
          Discard candidate
        </button>
      </div>
      <div className="controls">
        <button onClick={() => settle('resolve')} disabled={!pending}>
          Resolve model resource
        </button>
        <button className="secondary" onClick={() => settle('reject')} disabled={!pending}>
          Reject model resource
        </button>
        <button className="secondary" onClick={reset}>
          Reset model
        </button>
      </div>
      <div className="cards">
        <div className="card">
          <h2>Current · committed output</h2>
          <pre data-testid="suspense-model-current">{model.boundary.getCurrent()}</pre>
        </div>
        <div className="card">
          <h2>Candidate · diagnostic only</h2>
          <pre data-testid="suspense-model-candidate">
            {model.candidate
              ? model.candidate.status + ': ' + model.candidate.content
              : model.error || 'No candidate'}
          </pre>
        </div>
      </div>
      <p>
        Model retry: {model.retryQueued ? 'queued — click Render / Retry' : 'no queued request'}.
      </p>
      <pre className="log" data-testid="suspense-model-log">
        {model.events.join('\n')}
      </pre>
      <p className="note">
        Settlement only queues retry. Click Render / Retry, then Commit to publish. These buttons
        expose model phases; real React drives them automatically. MiniSuspense calls a child
        function, not React JSX. It omits Fiber unwind, lanes, hidden trees, nested boundaries, and
        fallback timing policy.
      </p>
      <Source code={resourceSource} file="createResource · teaching-only read helper" />
      <Source code={source} file="models/suspense.mjs · MiniSuspense + separate commit" />
    </section>
  );
}
