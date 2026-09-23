// Reuse the audited queue; its complete implementation is shown in the page.
import {processQueue, SyncLane, TransitionLane} from '../../examples/mini-concurrent-react.mjs';
export {processQueue, SyncLane, TransitionLane};

export const updates = [
  {label: '+10', lane: TransitionLane, action: n => n + 10},
  {label: '×2', lane: SyncLane, action: n => n * 2},
  {label: '+1', lane: TransitionLane, action: n => n + 1},
];

export function rebaseExample() {
  const urgent = processQueue(1, updates, SyncLane);
  const final = processQueue(urgent.baseState, urgent.baseQueue, TransitionLane);
  return {urgent, final};
}
