import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleUnits } from './scheduler.mjs';
import { createDraft, exampleTree, performUnitOfWork, publish } from './fiber.mjs';
import { rebaseExample } from './queue.mjs';
import { createRequest } from '../resources.mjs';
import { createResource } from '../../examples/mechanisms.mjs';
import { createSuspenseBoundary } from './suspense.mjs';

test('scheduler retains its next unit across host tasks and cancellation', () => {
  const host = [],
    output = [],
    slices = [];
  let clock = 0;
  const cancel = scheduleUnits(
    [1, 2, 3].map((n) => () => {
      output.push(n);
      clock += 3;
    }),
    {
      postTask: (fn) => host.push(fn),
      now: () => clock,
      budgetMs: 5,
      onSlice: (slice) => slices.push(slice),
    },
  );
  host.shift()();
  assert.deepEqual(output, [1, 2]);
  assert.deepEqual(slices, [{ first: 0, next: 2 }]);
  cancel();
  host.shift()();
  assert.deepEqual(output, [1, 2]);
});
test('a long unit overruns the budget but remaining units run later', () => {
  const host = [],
    output = [];
  let clock = 0;
  scheduleUnits(
    [
      () => {
        output.push('long');
        clock += 100;
      },
      () => output.push('next'),
    ],
    {
      postTask: (fn) => host.push(fn),
      now: () => clock,
    },
  );
  host.shift()();
  assert.deepEqual(output, ['long']);
  host.shift()();
  assert.deepEqual(output, ['long', 'next']);
});
test('Fiber draft cannot publish early and discarding it leaves current output intact', () => {
  const current = ['old'];
  let draft = createDraft(exampleTree());
  performUnitOfWork(draft);
  assert.equal(draft.next.name, 'Input');
  assert.throws(() => publish(draft), /Finish/);
  draft = createDraft(exampleTree()); // Discard the old draft.
  assert.deepEqual(current, ['old']);
  while (draft.next) performUnitOfWork(draft);
  assert.deepEqual(publish(draft), ['App', 'Input', 'Results', 'Row A', 'Row B']);
  assert.deepEqual(draft.events, [
    'begin App',
    'begin Input',
    'complete Input',
    'begin Results',
    'begin Row A',
    'complete Row A',
    'begin Row B',
    'complete Row B',
    'complete Results',
    'complete App',
  ]);
});
test('queue lesson preserves the noncommutative update order', () => {
  const { urgent, final } = rebaseExample();
  assert.equal(urgent.state, 2);
  assert.equal(urgent.baseState, 1);
  assert.equal(final.state, 23);
});
test('controlled React resources keep promise identity and settle once', async () => {
  const request = createRequest('A'),
    promise = request.promise;
  request.resolve();
  request.reject();
  assert.equal(request.promise, promise);
  assert.equal(await promise, 'A');
  const rejected = createRequest('B');
  rejected.reject();
  await assert.rejects(rejected.promise, /Could not load B/);
});

test('Suspense render and discard do not publish fallback or change revealed state', () => {
  const boundary = createSuspenseBoundary(() => {});
  boundary.commit(boundary.MiniSuspense({ children: () => 'A' }));
  const pending = { then() {} };
  const props = {
    children: () => {
      throw pending;
    },
    fallback: 'Loading',
  };
  const candidate = boundary.MiniSuspense(props);
  assert.deepEqual(candidate, { status: 'fallback', content: 'Loading' });
  assert.equal(boundary.getCurrent(), 'A');
  // Discard that candidate. A subsequent Transition still sees committed A.
  assert.deepEqual(boundary.MiniSuspense({ ...props, transition: true }), {
    status: 'retained',
    content: 'A',
  });
  boundary.commit(candidate);
  assert.equal(boundary.getCurrent(), 'Loading');
  assert.equal(boundary.MiniSuspense({ ...props, transition: true }).status, 'fallback');
});

test('Suspense cannot retain content on an initial pending mount', () => {
  const boundary = createSuspenseBoundary(() => {});
  const candidate = boundary.MiniSuspense({
    children: () => {
      throw { then() {} };
    },
    fallback: 'Loading',
    transition: true,
  });
  assert.equal(candidate.status, 'fallback');
  assert.equal(boundary.getCurrent(), undefined);
  boundary.commit(candidate);
  assert.equal(boundary.getCurrent(), 'Loading');
});

test('one resource ping queues one retry; retry rendering still needs commit', async () => {
  const request = createRequest('B');
  const resource = createResource(request.promise);
  let wakeable;
  try {
    resource.read();
  } catch (value) {
    wakeable = value;
  }
  const retries = [];
  const boundary = createSuspenseBoundary(() => retries.push('retry'));
  const props = { children: resource.read, fallback: 'Loading' };
  boundary.commit(boundary.MiniSuspense(props));
  boundary.MiniSuspense(props); // Same pending resource must not add another listener.
  request.resolve();
  await wakeable;
  assert.deepEqual(retries, ['retry']);
  assert.equal(boundary.getCurrent(), 'Loading');
  const candidate = boundary.MiniSuspense(props);
  assert.deepEqual(candidate, { status: 'content', content: 'B' });
  assert.equal(boundary.getCurrent(), 'Loading');
  boundary.commit(candidate);
  assert.equal(boundary.getCurrent(), 'B');
});

test('rejection pings the boundary, then retry throws to error handling', async () => {
  const request = createRequest('B');
  const resource = createResource(request.promise);
  let wakeable;
  try {
    resource.read();
  } catch (value) {
    wakeable = value;
  }
  let retries = 0;
  const boundary = createSuspenseBoundary(() => retries++);
  const props = { children: resource.read, fallback: 'Loading' };
  boundary.commit(boundary.MiniSuspense(props));
  request.reject();
  await wakeable;
  assert.equal(retries, 1);
  assert.throws(() => boundary.MiniSuspense(props), /Could not load B/);
  assert.equal(boundary.getCurrent(), 'Loading');
  assert.throws(
    () =>
      boundary.MiniSuspense({
        children: () => {
          throw null;
        },
      }),
    (e) => e === null,
  );
});
