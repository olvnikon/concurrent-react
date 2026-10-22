// Reuse the audited queue; its complete implementation is shown in the page.
import { processQueue, SyncLane, TransitionLane } from '../../examples/mini-concurrent-react.mjs';
export { processQueue, SyncLane, TransitionLane };

// Read top to bottom: lane says WHEN it may run; action says HOW state changes.
export const updates = [
  { label: '+10', lane: TransitionLane, action: (n) => n + 10 },
  { label: '×2', lane: SyncLane, action: (n) => n * 2 },
  { label: '+1', lane: TransitionLane, action: (n) => n + 1 },
];

export function rebaseExample(baseState) {
  // Demo step 1: skip +10, apply x2, skip +1. Starting from 1 gives 2.
  const urgent = processQueue(baseState, updates, SyncLane);
  // Demo step 2: restart from the saved base, not the urgent result. From 1, this gives 23.
  // x2 runs again to rebuild the order, not to multiply the urgent result a second time.
  const final = processQueue(urgent.baseState, urgent.baseQueue, TransitionLane);
  return { urgent, final };
}
