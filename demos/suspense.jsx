import React, {Component, Profiler, Suspense, use, useState, useTransition} from 'react';
import {Lesson, Source} from './shared.jsx';
import {createRequest, createScenario} from './resources.mjs';
import {onRender, mark} from './profiling.mjs';
import source from './suspense.jsx?raw';
import mechanismSource from '../examples/mechanisms.mjs?raw';

class ErrorBoundary extends Component {
  state = {error: null};
  static getDerivedStateFromError(error) { return {error}; }
  render() {
    return this.state.error
      ? <p role="alert">{this.state.error.message}. Use Reset to try again.</p>
      : this.props.children;
  }
}
function Article({request}) {
  const title = use(request.promise);
  return <article className="article"><div className="eyebrow">REVEALED CONTENT</div>
    <h2>{title}</h2><p>This content becomes visible when its stable promise resolves.</p></article>;
}
function Scenario({initial}) {
  const [request, setRequest] = useState(initial);
  const [control, setControl] = useState(initial);
  const [mode, setMode] = useState('urgent');
  const [isPending, startTransition] = useTransition();
  const [settled, setSettled] = useState(initial.status !== 'pending');
  function load() {
    const next = createRequest('Article B');
    setControl(next); setSettled(false); mark('request:' + mode);
    if (mode === 'transition') startTransition(() => setRequest(next));
    else setRequest(next);
  }
  function settle(outcome) {
    mark('resource:' + outcome); control[outcome](); setSettled(true);
  }
  return <>
    <div className="controls">
      <label>Replacement mode<select value={mode} onChange={e => setMode(e.target.value)} disabled={!settled || isPending}>
        <option value="urgent">Urgent</option><option value="transition">Transition</option></select></label>
      <button onClick={load} disabled={!settled || isPending}>Load Article B</button>
      <button onClick={() => settle('resolve')} disabled={settled}>Resolve resource</button>
      <button className="secondary" onClick={() => settle('reject')} disabled={settled}>Reject resource</button>
    </div>
    <p role="status">{isPending ? 'Transition pending — current content can stay visible.' : settled ? 'Resource settled.' : 'Resource pending.'}</p>
    <ErrorBoundary><Suspense fallback={<p className="fallback" data-testid="fallback">Loading article…</p>}>
      <Article request={request}/>
    </Suspense></ErrorBoundary>
  </>;
}

// Module initialization happens outside rendering; reset creates a new scenario in an event.
const firstScenario = createScenario();
export default function SuspenseLesson() {
  const [scenario, setScenario] = useState(firstScenario);
  const [generation, setGeneration] = useState(0);
  function reset(pending) {setScenario(createScenario(pending)); setGeneration(n => n + 1);}
  const boundarySource = mechanismSource.slice(0, mechanismSource.indexOf('// Simplified store'));
  return <Lesson number="05" kind="Real React + educational model" title="Wait for data. Then retry."
    question="When should a boundary show fallback, and when can current content stay visible?">
    <div className="controls"><button className="secondary" onClick={() => reset(false)}>Reset to revealed A</button>
      <button className="secondary" onClick={() => reset(true)}>Reset to pending mount</button></div>
    <Profiler id="Suspense" onRender={onRender}><Scenario key={generation} initial={scenario.initial}/></Profiler>
    <p className="note">Compare both modes from revealed Article A. Resolve is a controlled stand-in
      for an external resource becoming ready. The pending Transition is waiting for data, not using CPU continuously.</p>
    <Source code={boundarySource} file="examples/mechanisms.mjs · educational Suspense"/>
    <Source code={source} file="suspense.jsx · real React"/>
  </Lesson>;
}
