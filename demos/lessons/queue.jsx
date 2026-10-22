import React, { useState } from 'react';
import { Lesson, Source } from '../shared.jsx';
import { rebaseExample, updates } from '../models/queue.mjs';
import engineSource from '../../examples/mini-concurrent-react.mjs?raw';

// Show the existing queue implementation rather than maintaining a second copy.
const queueCode = engineSource.slice(
  engineSource.indexOf('export const NoLane'),
  engineSource.indexOf('// 43 lines:'),
);
export function QueueLesson() {
  // Buttons reveal two precomputed passes; they do not schedule real React lanes.
  // phase: 0 = initial 1, 1 = urgent result 2, 2 = replayed result 23.
  const [phase, setPhase] = useState(0);
  // Start the code walkthrough in rebaseExample; then open its processQueue loop.
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
