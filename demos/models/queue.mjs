// Reuse the audited queue; its complete implementation is shown in the page.
import { processQueue, SyncLane, TransitionLane } from '../../examples/mini-concurrent-react.mjs';
export { processQueue, SyncLane, TransitionLane };

// Read top to bottom: lane says WHEN it may run; action says HOW state changes.
export const updates = [
  { label: '+10', lane: TransitionLane, action: (n) => n + 10 },
  { label: '×2', lane: SyncLane, action: (n) => n * 2 },
  { label: '+1', lane: TransitionLane, action: (n) => n + 1 },
];

export function rebaseExample() {
  // Demo step 1: skip +10, apply x2, skip +1. Show 2, but remember the starting 1.
  const urgent = processQueue(1, updates, SyncLane);
  // Demo step 2: restart from saved 1, not 2. Replay +10, x2, +1 -> 23.
  // x2 runs again to rebuild the correct order; it is not applied twice to visible 2.
  const final = processQueue(urgent.baseState, urgent.baseQueue, TransitionLane);
  return { urgent, final };
}
