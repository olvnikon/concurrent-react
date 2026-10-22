import React, { Component, Profiler, Suspense, use, useState, useTransition } from 'react';
import { Lesson, Source } from '../shared.jsx';
import { createRequest, createScenario } from '../resources.mjs';
import { onRender, mark } from '../profiling.mjs';
import source from './suspense.jsx?raw';
import SuspenseModel from './suspense-model.jsx';

// Rejections are errors, not pending work: Suspense does not handle them.
class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <p role="alert">{this.state.error.message}. Use Reset to try again.</p>
    ) : (
      this.props.children
    );
  }
}
function Article({ request }) {
  // Read the same stable promise on every attempt; React handles pending reads.
  const title = use(request.promise);
  return (
    <article className="article">
      <div className="eyebrow">REVEALED CONTENT</div>
      <h2>{title}</h2>
      <p>This content becomes visible when its stable promise resolves.</p>
    </article>
  );
}
function Scenario({ initial }) {
  const [request, setRequest] = useState(initial);
  // Controls must reach B even while a Transition keeps committed A on screen.
  const [control, setControl] = useState(initial);
  const [mode, setMode] = useState('urgent');
  const [isPending, startTransition] = useTransition();
  const [settled, setSettled] = useState(initial.status !== 'pending');
  function load() {
    // Create the promise once in this event, never during rendering.
    const next = createRequest('Article B');
    setControl(next);
    setSettled(false);
    mark('request:' + mode);
    if (mode === 'transition') startTransition(() => setRequest(next));
    else setRequest(next);
  }
  function settle(outcome) {
    // Stand in for a response arriving; React then retries the pending content.
    mark('resource:' + outcome);
    control[outcome]();
    setSettled(true);
  }
  let status = 'Resource pending.';
  if (isPending) {
    status = 'Transition pending — current content can stay visible.';
  } else if (settled) {
    status = 'Resource settled.';
  }
  return (
    <>
      <div className="controls">
        <label>
          Replacement mode
          <select
            aria-label="Replacement mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            disabled={!settled || isPending}
          >
            <option value="urgent">Urgent</option>
            <option value="transition">Transition</option>
          </select>
        </label>
        <button onClick={load} disabled={!settled || isPending}>
          Load Article B
        </button>
        <button onClick={() => settle('resolve')} disabled={settled}>
          Resolve resource
        </button>
        <button className="secondary" onClick={() => settle('reject')} disabled={settled}>
          Reject resource
        </button>
      </div>
      <p role="status">{status}</p>
      <ErrorBoundary>
        <Suspense
          fallback={
            <p className="fallback" data-testid="fallback">
              Loading article…
            </p>
          }
        >
          <Article request={request} />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}

// Module initialization happens outside rendering; reset creates a new scenario in an event.
const firstScenario = createScenario();
export default function SuspenseLesson() {
  const [scenario, setScenario] = useState(firstScenario);
  const [generation, setGeneration] = useState(0);
  function reset(pending) {
    // A new key resets both the scenario and any previous error-boundary state.
    setScenario(createScenario(pending));
    setGeneration((n) => n + 1);
  }
  return (
    <Lesson
      number="05"
      kind="Real React + educational model"
      title="Wait for data. Then retry."
      question="When should a boundary show fallback, and when can current content stay visible?"
    >
      <SuspenseModel />
      <h2>Compare with real React Suspense</h2>
      <div className="controls">
        <button className="secondary" onClick={() => reset(false)}>
          Reset to revealed A
        </button>
        <button className="secondary" onClick={() => reset(true)}>
          Reset to pending mount
        </button>
      </div>
      <Profiler id="Suspense" onRender={onRender}>
        <Scenario key={generation} initial={scenario.initial} />
      </Profiler>
      <p className="note">
        Compare both modes from revealed Article A. Resolve is a controlled stand-in for an external
        resource becoming ready. The pending Transition is waiting for data, not using CPU
        continuously.
      </p>
      <Source code={source} file="lessons/suspense.jsx · real React" />
    </Lesson>
  );
}
