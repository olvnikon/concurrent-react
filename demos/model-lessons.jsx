import React, { useEffect, useRef, useState } from 'react';
import { Lesson, Source, spin } from './shared.jsx';
import { createHostTasks, scheduleUnits } from './models/scheduler.mjs';
import { createDraft, exampleTree, performUnitOfWork, publish } from './models/fiber.mjs';
import { rebaseExample, updates } from './models/queue.mjs';
import schedulerSource from './models/scheduler.mjs?raw';
import fiberSource from './models/fiber.mjs?raw';
import engineSource from '../examples/mini-concurrent-react.mjs?raw';

const NUMBER_OF_UNITS = 1200;

export function SchedulerLesson() {
  const [mode, setMode] = useState('tasks');
  const [cost, setCost] = useState(2);
  const [slices, setSlices] = useState([]);
  const [running, setRunning] = useState(false);
  const [taps, setTaps] = useState(0);
  const cleanup = useRef(() => {});
  const frameOutput = useRef(null);

  useEffect(() => {
    let frames = 0;
    let handle;

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
    const units = Array.from({ length: NUMBER_OF_UNITS }, () => () => spin(cost));
    const record = ({ first, next }) => {
      entries.push('Units ' + (first + 1) + '–' + next);
      setSlices([...entries]);
    };

    if (mode === 'blocking') {
      units.forEach((unit) => unit());
      record({ first: 0, next: units.length });
      setRunning(false);
      return;
    }
    const host = mode === 'tasks' ? createHostTasks() : null;
    const cancel = scheduleUnits(units, {
      postTask: host ? host.postTask : queueMicrotask,
      onSlice: record,
      onDone: () => {
        host?.close();
        setRunning(false);
      },
    });
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
      <Source code={schedulerSource} file="models/scheduler.mjs" />
    </Lesson>
  );
}

export function FiberLesson() {
  const [draft, setDraft] = useState(() => createDraft(exampleTree()));
  const [current, setCurrent] = useState(['Previously committed UI']);
  function step() {
    performUnitOfWork(draft);
    setDraft({ ...draft });
  }
  function run() {
    while (draft.next) performUnitOfWork(draft);
    setDraft({ ...draft });
  }
  return (
    <Lesson
      number="02"
      kind="Educational reconstruction"
      title="Keep the draft private."
      question="How can a traversal pause while the visible output stays coherent?"
    >
      <p className="tree">App → Input · Results → Row A · Row B</p>
      <div className="controls">
        <button disabled={!draft?.next} onClick={step}>
          Step one unit
        </button>
        <button disabled={!draft?.next} onClick={run}>
          Finish draft
        </button>
        <button
          disabled={!draft || !!draft.next}
          onClick={() => {
            setCurrent(publish(draft));
            setDraft(null);
          }}
        >
          Publish
        </button>
        <button className="secondary" disabled={!draft} onClick={() => setDraft(null)}>
          Discard draft
        </button>
        <button
          className="secondary"
          onClick={() => {
            setCurrent(['Previously committed UI']);
            setDraft(createDraft(exampleTree()));
          }}
        >
          Reset
        </button>
      </div>
      <p>
        Next unit: <strong>{draft?.next?.name ?? 'none'}</strong>
      </p>
      <div className="cards">
        <div className="card">
          <h2>Current output</h2>
          <pre data-testid="fiber-current">{current.join('\n')}</pre>
        </div>
        <div className="card">
          <h2>Draft output</h2>
          <pre>{draft?.output.join('\n') || '(empty)'}</pre>
        </div>
      </div>
      <pre className="log">{draft?.events.join('\n') || 'No active draft.'}</pre>
      <p className="note">
        The tree is fixed. Publication copies a finished list. Real React also reconciles children,
        reuses alternate Fibers, and traverses commit effects.
      </p>
      <Source code={fiberSource} file="models/fiber.mjs" />
    </Lesson>
  );
}

const queueCode = engineSource.slice(
  engineSource.indexOf('export const NoLane'),
  engineSource.indexOf('// 43 lines:'),
);
export function QueueLesson() {
  const [phase, setPhase] = useState(0);
  const { urgent, final } = rebaseExample();
  return (
    <Lesson
      number="03"
      kind="Educational reconstruction"
      title="Skip now. Preserve the order."
      question="What must the queue remember when an urgent update jumps ahead?"
    >
      <div className="controls">
        <button disabled={phase === 2} onClick={() => setPhase((n) => n + 1)}>
          {phase === 0 ? 'Process urgent lane' : 'Process transition lane'}
        </button>
        <button className="secondary" onClick={() => setPhase(0)}>
          Reset
        </button>
      </div>
      <div className="answer" data-testid="queue-state">
        {phase === 0 ? 1 : phase === 1 ? urgent.state : final.state}
      </div>
      <table>
        <thead>
          <tr>
            <th>Update order</th>
            <th>Lane</th>
            <th>Urgent pass</th>
            <th>Transition pass</th>
          </tr>
        </thead>
        <tbody>
          {updates.map((u, i) => (
            <tr key={u.label}>
              <td>{u.label}</td>
              <td>{i === 1 ? 'Urgent · 01' : 'Transition · 10'}</td>
              <td>{phase ? (i === 1 ? 'Apply → 2; keep replay copy' : 'Skip; retain') : '—'}</td>
              <td>
                {phase === 2 ? ['1 + 10 = 11', '11 × 2 = 22 (replay)', '22 + 1 = 23'][i] : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Saved base state: <strong>{phase ? urgent.baseState : '1'}</strong>. Replay starts before
        the first skipped update, not from the urgent result.
      </p>
      <p className="note">
        Two toy lanes and one queue. React also has per-hook queues, lane groups, entanglement and
        expiration. Replaying calculation does not publish the urgent update twice.
      </p>
      <Source code={queueCode} file="examples/mini-concurrent-react.mjs · queue excerpt" />
    </Lesson>
  );
}
