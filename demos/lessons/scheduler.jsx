import React, { useEffect, useRef, useState } from 'react';
import { Lesson, Source, spin } from '../shared.jsx';
import { createHostTasks, createIdleTasks, scheduleUnits } from '../models/scheduler.mjs';
import schedulerSource from '../models/scheduler.mjs?raw';

// Enough small units to leave time for live tapping; this is not the slice count.
const NUMBER_OF_UNITS = 1200;

export function SchedulerLesson() {
  const [mode, setMode] = useState('tasks');
  const [cost, setCost] = useState(2);
  const [slices, setSlices] = useState([]);
  const [running, setRunning] = useState(false);
  const [taps, setTaps] = useState(0);
  const [simulateLoad, setSimulateLoad] = useState(false);
  // Keep cancellation available to Reset and unmount without triggering a render.
  const cleanup = useRef(() => {});
  const frameOutput = useRef(null);

  useEffect(() => {
    let frames = 0;
    let handle;

    // Count animation callbacks, not paints; avoid a React update for every frame.
    function frame() {
      if (frameOutput.current) frameOutput.current.textContent = ++frames;
      handle = requestAnimationFrame(frame);
    }
    handle = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(handle);
      cleanup.current();
    };
  }, []);

  useEffect(() => {
    if (!simulateLoad || !running) return;
    let handle;
    function simulateFrameLoad() {
      // Artificial animation work uses time the browser might otherwise leave idle.
      spin(50);
      handle = requestAnimationFrame(simulateFrameLoad);
    }
    handle = requestAnimationFrame(simulateFrameLoad);
    // Stop on completion, Reset, unmount, or when the load setting changes.
    return () => cancelAnimationFrame(handle);
  }, [simulateLoad, running]);

  // Stop the old run before clearing its diagnostic UI.
  function reset() {
    cleanup.current();
    setRunning(false);
    setSlices([]);
    setTaps(0);
  }

  function run() {
    reset();
    setRunning(true);
    const entries = [];
    // Each spin blocks on purpose. Yielding is possible only BETWEEN these calls.
    const units = Array.from({ length: NUMBER_OF_UNITS }, () => () => spin(cost));
    // Indices are zero-based; the log displays a human-friendly range.
    const record = ({ firstUnitIndex, nextUnitIndex }) => {
      entries.push('Units ' + (firstUnitIndex + 1) + '–' + nextUnitIndex);
      setSlices([...entries]);
    };

    // One long callback: input and animation callbacks must wait until it returns.
    if (mode === 'blocking') {
      units.forEach((unit) => unit());
      record({ firstUnitIndex: 0, nextUnitIndex: units.length });
      setRunning(false);
      return;
    }
    // Both browser helpers expose postTask and close; microtasks need no host helper.
    let host = null;
    if (mode === 'tasks') {
      host = createHostTasks();
    } else if (mode === 'idle') {
      host = createIdleTasks();
    }
    const cancel = scheduleUnits(units, {
      postTask: host ? host.postTask : queueMicrotask,
      onSlice: record,
      onDone: () => {
        host?.close();
        setRunning(false);
      },
    });
    // Stop future slices and release the pending idle callback or MessageChannel.
    cleanup.current = () => {
      cancel();
      host?.close();
    };
  }

  return (
    <Lesson
      number="01"
      kind="Educational reconstruction"
      title="Give the browser a turn."
      question="Where can the browser regain control between pieces of work?"
    >
      <div className="controls">
        <label>
          Scheduling
          <select value={mode} disabled={running} onChange={(e) => setMode(e.target.value)}>
            <option value="blocking">One blocking function</option>
            <option value="tasks">MessageChannel tasks</option>
            <option value="microtasks">Microtask chain</option>
            <option value="idle" disabled={typeof requestIdleCallback !== 'function'}>
              requestIdleCallback
            </option>
          </select>
        </label>
        <label>
          Work per unit
          <select value={cost} disabled={running} onChange={(e) => setCost(Number(e.target.value))}>
            <option value="1">1 ms</option>
            <option value="2">2 ms</option>
            <option value="4">4 ms</option>
          </select>
        </label>
        <button onClick={run} disabled={running}>
          Run work
        </button>
        <button className="secondary" onClick={reset}>
          Reset
        </button>
      </div>
      <div className="controls">
        <label className="load-toggle">
          <input
            type="checkbox"
            checked={simulateLoad}
            onChange={(event) => setSimulateLoad(event.target.checked)}
          />
          Simulate browser load
        </label>
      </div>
      <p className="muted">
        Artificial CPU work: 24 ms per animation callback, only while the job runs. Compare idle
        mode with MessageChannel using the same load. Turn load off mid-run to let idle time return.
        Reset stops both jobs; the load setting is kept for the next run. The result depends on the
        browser and display.
      </p>
      <div className="cards">
        <div className="card">
          <h2>Try another interaction</h2>
          <button onClick={() => setTaps((n) => n + 1)}>Tap while working</button>
          <p>{taps} taps handled</p>
          <p>
            Animation-frame callbacks: <strong ref={frameOutput}>0</strong>
          </p>
        </div>
        <div className="card">
          <h2>Work slices</h2>
          <p role="status">{running ? 'Working…' : 'Ready'}</p>
          <pre className="log">
            {slices.join('\n') || 'Run a comparison to see the unit boundaries.'}
          </pre>
        </div>
      </div>
      <p className="note">
        The model checks a 5 ms budget between units. A microtask chain still holds the browser in
        the microtask checkpoint. The frame counter counts callbacks, not paints.
      </p>
      {mode === 'idle' && (
        <p className="note">
          Idle mode also checks deadline.timeRemaining(). It can progress well on a quiet page, but
          may wait under load. Typing or tapping does not guarantee it will stop. This is an API
          comparison, not React's Scheduler implementation.{' '}
          <a href="https://w3c.github.io/requestidlecallback/#idle-periods">Idle callback rules</a>
        </p>
      )}
      <Source code={schedulerSource} file="models/scheduler.mjs" />
    </Lesson>
  );
}
