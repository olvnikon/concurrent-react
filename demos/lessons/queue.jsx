import React, { useState } from 'react';
import { Lesson, Source } from '../shared.jsx';
import { rebaseExample, updates } from '../models/queue.mjs';
import engineSource from '../../examples/mini-concurrent-react.mjs?raw';

const BASE_STATE = 1;

export function QueueLesson() {
  // Buttons reveal two precomputed passes; they do not schedule real React lanes.
  // phase: 0 = initial 1, 1 = urgent result 2, 2 = replayed result 23.
  const [phase, setPhase] = useState(0);
  // Start the code walkthrough in rebaseExample; then open its processQueue loop.
  const { urgent, final } = rebaseExample(BASE_STATE);
  let visibleState;
  if (phase === 0) {
    visibleState = BASE_STATE;
  } else if (phase === 1) {
    visibleState = urgent.state;
  } else {
    visibleState = final.state;
  }
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
        {visibleState}
      </div>
      {/* Each row is one queued update. Read down a column to follow one pass. */}
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
          {updates.map((u, i) => {
            let urgentStep = '—';
            if (phase && i === 1) {
              urgentStep = 'Apply → 2; keep replay copy';
            } else if (phase) {
              urgentStep = 'Skip; retain';
            }
            return (
              <tr key={u.label}>
                <td>{u.label}</td>
                <td>{i === 1 ? 'Urgent · 01' : 'Transition · 10'}</td>
                <td>{urgentStep}</td>
                <td>
                  {phase === 2 ? ['1 + 10 = 11', '11 × 2 = 22 (replay)', '22 + 1 = 23'][i] : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        Saved base state: <strong>{phase ? urgent.baseState : BASE_STATE}</strong>. Replay starts
        before the first skipped update, not from the urgent result.
      </p>
      <p className="note">
        Two toy lanes and one queue. React also has per-hook queues, lane groups, entanglement and
        expiration. Replaying calculation does not publish the urgent update twice.
      </p>
      <Source code={engineSource} file="examples/mini-concurrent-react.mjs · queue excerpt" />
    </Lesson>
  );
}
