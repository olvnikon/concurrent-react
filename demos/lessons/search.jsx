import React, { memo, Profiler, startTransition, useState } from 'react';
import { Lesson, Source, spin } from '../shared.jsx';
import { onRender, mark, clearRecording, commits } from '../profiling.mjs';
import source from './search.jsx?raw';

function SlowRow({ query, index, cost }) {
  // Separate component calls give React checkpoints between rows, not inside spin.
  if (query) spin(cost);
  return (
    <li>
      {query || 'empty'} · row {index + 1}
    </li>
  );
}
// Unchanged props let the urgent input pass skip expensive results.
const SlowResults = memo(function SlowResults({ query, cost, shape }) {
  // This variant puts the SAME total cost inside one indivisible call.
  if (query && shape === 'single') spin(cost * 120);
  return (
    <ul className="results" data-testid="search-results" data-query={query}>
      {Array.from({ length: 120 }, (_, index) => (
        <SlowRow key={index} query={query} index={index} cost={shape === 'single' ? 0 : cost} />
      ))}
    </ul>
  );
});

function SearchExample({ mode, cost, shape }) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  function change(event) {
    const value = event.target.value;
    mark('input:' + value);
    setInput(value); // The controlled input always stays urgent.
    // The callback runs now; the marked state update can render at lower urgency.
    if (mode === 'transition') startTransition(() => setQuery(value));
    else setQuery(value);
  }
  return (
    <>
      <label className="search-label">
        Search
        <input value={input} onChange={change} placeholder="Type a, then b…" />
      </label>
      <div className="state-line">
        <span>
          Input: <strong data-testid="input-value">{input || '∅'}</strong>
        </span>
        <span>
          Results query: <strong data-testid="query-value">{query || '∅'}</strong>
        </span>
        <span role="status">{input !== query ? 'Results are catching up…' : 'Up to date'}</span>
      </div>
      <Profiler id="SlowResults" onRender={onRender}>
        <SlowResults query={query} cost={cost} shape={shape} />
      </Profiler>
    </>
  );
}

export default function SearchLesson() {
  // Changing settings or Reset remounts SearchExample via its key.
  const [mode, setMode] = useState('ordinary');
  const [cost, setCost] = useState(2);
  const [shape, setShape] = useState('rows');
  const [reset, setReset] = useState(0);
  const [summary, setSummary] = useState('');
  return (
    <Lesson
      number="04"
      kind="Real React"
      title="Input first. Results can follow."
      question="What changes when the expensive update becomes a Transition?"
    >
      <div className="controls">
        <label>
          Update mode
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="ordinary">Ordinary updates</option>
            <option value="transition">Transition</option>
          </select>
        </label>
        <label>
          CPU per row
          <select value={cost} onChange={(e) => setCost(Number(e.target.value))}>
            <option value="1">1 ms</option>
            <option value="2">2 ms</option>
            <option value="4">4 ms</option>
          </select>
        </label>
        <label>
          Work distribution
          <select value={shape} onChange={(e) => setShape(e.target.value)}>
            <option value="rows">120 small components</option>
            <option value="single">One indivisible call</option>
          </select>
        </label>
        <button
          className="secondary"
          onClick={() => {
            clearRecording();
            setSummary('');
            setReset((n) => n + 1);
          }}
        >
          Reset
        </button>
      </div>
      <Profiler id="Search" onRender={onRender}>
        <SearchExample key={mode + shape + cost + reset} mode={mode} cost={cost} shape={shape} />
      </Profiler>
      <p className="note">
        The results subtree is memoized so an urgent input update can skip it when its query is
        unchanged. CPU work lives inside rendering, not inside the Transition callback.
      </p>
      <details>
        <summary>Profiling this example</summary>
        <p>
          Record the same typing in React DevTools Profiler, then browser Performance. Inspect
          React's Blocking and Transition tracks, host tasks, commits, and browser rendering.
          Ordinary production builds do not expose these tracks.
        </p>
        <button
          className="secondary"
          onClick={() => setSummary(JSON.stringify(commits.slice(-12), null, 2))}
        >
          Read recent commit timings
        </button>
        <pre className="log">
          {summary || 'Commit timings are collected without rerendering this diagnostic panel.'}
        </pre>
        <p>These callbacks describe commits. They cannot establish abandoned work on their own.</p>
      </details>
      <Source code={source} file="lessons/search.jsx" />
    </Lesson>
  );
}
