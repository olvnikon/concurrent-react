import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleUnits } from './scheduler.mjs';
import { createDraft, exampleTree, performUnitOfWork, publish } from './fiber.mjs';
import { rebaseExample } from './queue.mjs';
import { createRequest } from '../resources.mjs';

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
