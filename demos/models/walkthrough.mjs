import {scheduleUnits} from './scheduler.mjs';
import {createDraft, exampleTree, performUnitOfWork, publish} from './fiber.mjs';
import {rebaseExample} from './queue.mjs';
import {createBoundary, createResource} from '../../examples/mechanisms.mjs';

let time = 0;
const tasks = [];
scheduleUnits(Array.from({length: 4}, (_, i) => () => {
  time += 3; console.log('unit', i);
}), {postTask: fn => tasks.push(fn), now: () => time,
  onSlice: slice => console.log('slice', slice)});
while (tasks.length) tasks.shift()();
const draft = createDraft(exampleTree());
while (draft.next) performUnitOfWork(draft);
console.log('Fiber:', draft.events, 'Published:', publish(draft));
console.log('Queue:', rebaseExample());

let resolve;
const resource = createResource(new Promise(r => { resolve = r; }));
const retryTasks = [];
const boundary = createBoundary(() => retryTasks.push(() =>
  console.log('retry:', boundary(() => resource.read(), 'Loading'))));
console.log('Suspense:', boundary(() => resource.read(), 'Loading'));
resolve('Ready');
await Promise.resolve(); await Promise.resolve();
while (retryTasks.length) retryTasks.shift()();
