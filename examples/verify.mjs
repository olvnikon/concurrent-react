import assert from 'node:assert/strict';
import {processQueue, createScheduler, createMiniConcurrentRoot, SyncLane, TransitionLane, NoLane} from './mini-concurrent-react.mjs';
import {createResource, createBoundary, snapshotsAreConsistent} from './mechanisms.mjs';
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS', name); }
check('Rebasing preserves insertion order with noncommutative updates', () => {
  const updates = [
    {lane: TransitionLane, action: n => n + 10},
    {lane: SyncLane, action: n => n * 2},
    {lane: TransitionLane, action: n => n + 1},
  ];
  const urgent = processQueue(1, updates, SyncLane);
  assert.equal(urgent.state, 2); assert.equal(urgent.baseState, 1);
  assert.deepEqual(urgent.baseQueue.map(x => x.lane), [2, NoLane, 2]);
  assert.equal(processQueue(urgent.baseState, urgent.baseQueue, TransitionLane).state, 23);
  assert.equal(updates[1].lane, SyncLane, 'processing must not mutate current queue');
});
function harness(options = {}) {
  let time = 0;
  const tasks = [], microtasks = [], events = [], commits = [];
  const now = () => time;
  const scheduler = createScheduler({now, postTask: cb => tasks.push(cb), budgetMs: 5});
  const app = createMiniConcurrentRoot({scheduler, now, queueMicrotask: cb => microtasks.push(cb),
    rowCount: 20, renderRow: ({query, index}) => { time += options.rowCost ?? 1; return `${query}:${index}`; },
    onEvent: e => events.push(e), commit: s => commits.push(s), ...options});
  const micro = () => { let guard=0; while(microtasks.length) { assert.ok(guard++ < 100); microtasks.shift()(); } };
  const task = () => { assert.ok(tasks.length, 'expected a host task'); tasks.shift()(); micro(); };
  const drain = () => { micro(); let guard=0; while(tasks.length) { assert.ok(guard++<100); task(); } };
  app.mount(); drain();
  return {app, events, commits, micro, task, drain, tasks};
}
check('Urgent input commits before transition; yielded work has no partial host commit', () => {
  const h = harness(); h.app.input('a'); h.micro();
  assert.equal(h.commits.at(-1).input, 'a'); assert.equal(h.commits.at(-1).query, '');
  const before = h.commits.length; h.task();
  assert.equal(h.commits.length, before); assert.ok(h.app.root.draft);
  assert.ok(h.events.some(e => e.type === 'yield'));
  h.drain(); assert.equal(h.commits.at(-1).query, 'a');
});
check('Second event abandons a draft, preserves updates, and commits only final query', () => {
  const h = harness(); h.app.input('a'); h.micro(); h.task();
  const firstDraft = h.app.root.generation;
  h.app.input('ab'); h.micro();
  assert.equal(h.commits.at(-1).input, 'ab'); assert.equal(h.commits.at(-1).query, '');
  assert.ok(h.events.some(e => e.type === 'abandon' && e.generation === firstDraft));
  h.drain(); assert.equal(h.commits.at(-1).query, 'ab');
  assert.ok(!h.commits.some(s => s.query === 'a'));
  assert.equal(h.app.root.pendingLanes, 0);
});
check('An unchanged lane resumes the same draft across tasks', () => {
  const h = harness(); h.app.input('a'); h.micro(); h.task();
  const generation = h.app.root.generation; h.task();
  assert.equal(h.app.root.generation, generation); h.drain();
});
check('An update arriving after the draft snapshot survives its commit', () => {
  const h = harness(); h.app.input('a'); h.micro(); h.task();
  h.app.setState(s => ({...s, query: 'later'}), TransitionLane); h.micro(); h.drain();
  assert.equal(h.commits.at(-1).query, 'later');
});
check('A 100 ms row overshoots the 5 ms budget; it cannot yield inside the call', () => {
  const h = harness({rowCost: 100}); h.app.input('a'); h.micro();
  const start=h.events.at(-1).time; h.task();
  const yieldEvent=h.events.findLast(e=>e.type==='yield');
  assert.ok(yieldEvent.time - start >= 100); h.drain();
});
check('Store checkpoint detects interleaved mutation', () => {
  let state = 1; const reads=[{getSnapshot:()=>state,value:1}];
  assert.equal(snapshotsAreConsistent(reads),true); state=2;
  assert.equal(snapshotsAreConsistent(reads),false);
});
let resolve; const resource=createResource(new Promise(r=>{resolve=r}));
let retries=0; const boundary=createBoundary(()=>retries++);
check('Suspense model keeps revealed content for a transition and deduplicates listeners', () => {
  assert.equal(boundary(()=> 'old','fallback').content,'old');
  assert.equal(boundary(()=>resource.read(),'fallback',{transition:true}).content,'old');
  assert.equal(boundary(()=>resource.read(),'fallback',{transition:true}).status,'suspended');
});
check('Suspense model does not restore old content after showing fallback', () => {
  const pending=createResource(new Promise(()=>{}));
  const localBoundary=createBoundary(()=>{});
  assert.equal(localBoundary(()=> 'old','fallback').content,'old');
  assert.equal(localBoundary(()=>pending.read(),'fallback').content,'fallback');
  assert.equal(localBoundary(()=>pending.read(),'fallback',{transition:true}).content,'fallback');
});
resolve('ready'); await Promise.resolve(); await Promise.resolve();
check('A resolved resource schedules one retry and can be read', () => {
  assert.equal(retries,1); assert.equal(boundary(()=>resource.read(),'fallback').content,'ready');
});
console.log(`${passed} behavioral checks passed.`);
