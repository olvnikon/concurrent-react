// Commit observations only. Never infer an abandoned render from this log.
export const commits = [];
export function onRender(id, phase, actualDuration, baseDuration, startTime, commitTime) {
  commits.push({id, phase, actualDuration, baseDuration, startTime, commitTime});
  if (commits.length > 200) commits.shift();
}
export function mark(label) {
  performance.mark('call:' + label);
}
export function clearRecording() {
  commits.length = 0;
  for (const entry of performance.getEntriesByType('mark')) {
    if (entry.name.startsWith('call:')) performance.clearMarks(entry.name);
  }
}
// Read-only diagnostics used by the browser rehearsal/recording scripts.
window.communityCall = {commits, clearRecording};
