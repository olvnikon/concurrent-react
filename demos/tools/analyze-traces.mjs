// Read-only summary of captured evidence; timings are observations, not assertions.
// node demos/tools/analyze-traces.mjs [capture-directory]
import { readFile, readdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('../../evidence/community-call/', import.meta.url));
const ms = (microseconds) => Math.round(microseconds / 100) / 10;
for (const file of (await readdir(directory)).filter((name) => name.endsWith('.json.gz'))) {
  const { traceEvents } = JSON.parse(gunzipSync(await readFile(resolve(directory, file))));
  const marks = traceEvents.filter((event) => event.name.startsWith('call:'));
  const origin = Math.min(...marks.map((event) => event.ts));
  const callbacks = JSON.parse(
    await readFile(resolve(directory, file.replace('.json.gz', '-commits.json')), 'utf8'),
  );
  const scheduler = traceEvents.filter(
    (event) =>
      event.args?.data?.trackGroup?.startsWith('Scheduler') &&
      event.args.data.end > event.args.data.start,
  );
  console.log(
    JSON.stringify(
      {
        file,
        profilerCallbacks: callbacks.length,
        uniqueCommitTimes: new Set(callbacks.map((entry) => entry.commitTime)).size,
        marks: marks.map((event) => ({ name: event.name, atMs: ms(event.ts - origin) })),
        phases: scheduler.map(({ args: { data } }) => ({
          track: data.track,
          phase: data.message,
          atMs: ms(data.start - origin),
          spanMs: ms(data.end - data.start),
        })),
        longTasksMs: traceEvents
          .filter((event) => event.name === 'RunTask' && event.ph === 'X' && event.dur >= 50000)
          .map((event) => ms(event.dur)),
      },
      null,
      2,
    ),
  );
}
