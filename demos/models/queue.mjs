// Reuse the audited queue; its complete implementation is shown in the page.
import { processQueue, SyncLane, TransitionLane } from '../../examples/mini-concurrent-react.mjs';
export { processQueue, SyncLane, TransitionLane };

export const updates = [
  { label: '+10', lane: TransitionLane, action: (n) => n + 10 },
  { label: '×2', lane: SyncLane, action: (n) => n * 2 },
  { label: '+1', lane: TransitionLane, action: (n) => n + 1 },
];

export function rebaseExample() {
  // Skip Transition updates now; retain the history needed to replay in order.
  const urgent = processQueue(1, updates, SyncLane);
  // Replay from the saved base, not from the urgent result of 2.
  const final = processQueue(urgent.baseState, urgent.baseQueue, TransitionLane);
  return { urgent, final };
}
