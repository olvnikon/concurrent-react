import React, { useState } from 'react';
import { Lesson, Source } from '../shared.jsx';
import { createDraft, exampleTree, performUnitOfWork, publish } from '../models/fiber.mjs';
import fiberSource from '../models/fiber.mjs?raw';

export function FiberLesson() {
  const [draft, setDraft] = useState(() => createDraft(exampleTree()));
  // Draft changes stay separate from the published output below.
  const [current, setCurrent] = useState(['Previously committed UI']);
  function step() {
    performUnitOfWork(draft);
    // The model mutates its draft; a new wrapper refreshes this diagnostic panel.
    setDraft({ ...draft });
  }
  // This button finishes synchronously; Step exposes the pause points manually.
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
            // Only Publish changes the output we call current.
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
