import { scheduleUnits } from './scheduler.mjs';
import { createDraft, exampleTree, performUnitOfWork, publish } from './fiber.mjs';
import { rebaseExample } from './queue.mjs';
import { createResource } from '../../examples/mechanisms.mjs';
import { createSuspenseBoundary } from './suspense.mjs';

let time = 0;
const tasks = [];
scheduleUnits(
  Array.from({ length: 4 }, (_, i) => () => {
    time += 3;
    console.log('unit', i);
  }),
  {
    postTask: (fn) => tasks.push(fn),
    now: () => time,
    onSlice: (slice) => console.log('slice', slice),
  },
);
while (tasks.length) tasks.shift()();
const draft = createDraft(exampleTree());
while (draft.next) performUnitOfWork(draft);
console.log('Fiber:', draft.events, 'Published:', publish(draft));
console.log('Queue:', rebaseExample());

let resolve;
const resource = createResource(
  new Promise((r) => {
    resolve = r;
  }),
);
const retryTasks = [];
const boundary = createSuspenseBoundary(() => retryTasks.push('retry'));
const props = { children: resource.read, fallback: 'Loading' };
let candidate = boundary.MiniSuspense(props);
console.log('Suspense draft:', candidate, 'Current:', boundary.getCurrent());
boundary.commit(candidate);
console.log('Commit:', boundary.getCurrent());
resolve('Ready');
await Promise.resolve();
await Promise.resolve();
console.log('Notification:', retryTasks, 'Current is still:', boundary.getCurrent());
candidate = boundary.MiniSuspense(props);
console.log('Retry draft:', candidate, 'Current is still:', boundary.getCurrent());
boundary.commit(candidate);
console.log('Commit:', boundary.getCurrent());
