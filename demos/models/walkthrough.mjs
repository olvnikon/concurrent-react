import { scheduleUnits } from './scheduler.mjs';
import { createDraft, exampleTree, performUnitOfWork, publish } from './fiber.mjs';
import { rebaseExample } from './queue.mjs';
import { createResource } from '../../examples/mechanisms.mjs';
import { createSuspenseBoundary } from './suspense.mjs';

// Educational model walkthrough, not a React trace. Run with npm run models.
// Queue callbacks and advance a fake clock so slice boundaries are repeatable.
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
// Manually deliver one simulated host task at a time; two 3 ms units exceed 5 ms.
while (tasks.length) tasks.shift()();
// Traverse a private Fiber draft, then publish only after all units finish.
const draft = createDraft(exampleTree());
while (draft.next) performUnitOfWork(draft);
console.log('Fiber:', draft.events, 'Published:', publish(draft));
// First process urgent work, then replay the retained updates from the saved base.
console.log('Queue:', rebaseExample(1));

// Keep one pending promise so repeated reads refer to the same resource.
let resolve;
const resource = createResource(
  new Promise((r) => {
    resolve = r;
  }),
);
const retryTasks = [];
const boundary = createSuspenseBoundary(() => retryTasks.push('retry'));
const props = { children: resource.read, fallback: 'Loading' };
// Pending render prepares fallback; commit is a separate publication step.
let candidate = boundary.MiniSuspense(props);
console.log('Suspense draft:', candidate, 'Current:', boundary.getCurrent());
boundary.commit(candidate);
console.log('Commit:', boundary.getCurrent());
resolve('Ready');
// Let the resource handler and its ping listener run; neither commits new output.
await Promise.resolve();
await Promise.resolve();
console.log('Notification:', retryTasks, 'Current is still:', boundary.getCurrent());
// Retry reads the now-ready resource; the last commit finally publishes it.
candidate = boundary.MiniSuspense(props);
console.log('Retry draft:', candidate, 'Current is still:', boundary.getCurrent());
boundary.commit(candidate);
console.log('Commit:', boundary.getCurrent());
