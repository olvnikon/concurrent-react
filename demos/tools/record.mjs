// Saves actual Chrome trace events, not a simulated React timeline.
// Run from the project root: npm run record
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { openLab, settledSearch } from './browser.mjs';

const lab = await openLab();
const { page, url } = lab;
// Keep earlier recordings intact so their annotations remain reproducible.
const captureId = new Date().toISOString().replaceAll(':', '-');
const directory = new URL(`../../evidence/community-call/${captureId}/`, import.meta.url);
const recordings = [];
const cdp = await page.context().newCDPSession(page);
await mkdir(directory, { recursive: true });
async function record(name, action) {
  const chunks = [];
  const collect = ({ value }) => chunks.push(...value);
  cdp.on('Tracing.dataCollected', collect);
  await page.evaluate(() => window.communityCall.clearRecording());
  await cdp.send('Tracing.start', {
    categories:
      'devtools.timeline,v8.execute,blink.user_timing,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.stack',
    options: 'record-as-much-as-possible',
    transferMode: 'ReportEvents',
  });
  await action();
  const done = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  await done;
  cdp.off('Tracing.dataCollected', collect);
  const commits = await page.evaluate(() => [...window.communityCall.commits]);
  const trace = { traceEvents: chunks, displayTimeUnit: 'ms' };
  await writeFile(new URL(name + '.json.gz', directory), gzipSync(JSON.stringify(trace)));
  await writeFile(new URL(name + '-commits.json', directory), JSON.stringify(commits, null, 2));
  const userTiming = chunks.filter((e) => e.cat?.includes('blink.user_timing'));
  const schedulerEvents = chunks.filter((e) => e.args?.data?.trackGroup?.startsWith('Scheduler'));
  const reactNames = [
    ...new Set([
      ...userTiming.map((e) => e.name),
      ...schedulerEvents.map((e) => e.args.data.message),
    ]),
  ].filter((n) =>
    /React|Blocking|Transition|Suspense|Render|Commit|Search|SlowRow|Article|Yield/i.test(n),
  );
  let workload = { controlledResourceWaitMs: 500 };
  if (name.startsWith('search-')) {
    workload = {
      cpuPerRowMs: 2,
      rows: 120,
      distribution: name.endsWith('indivisible') ? 'single' : 'rows',
    };
  }
  recordings.push({
    name,
    events: chunks.length,
    profilerCallbacks: commits.length,
    uniqueCommitTimes: new Set(commits.map((entry) => entry.commitTime)).size,
    reactEventNames: reactNames,
    input: 'Playwright keyboard events / UI clicks',
    workload,
  });
}
try {
  await page.goto(url + '/#search');
  await page.getByLabel('Search', { exact: true }).waitFor();
  for (const mode of ['ordinary', 'transition']) {
    await page.getByLabel('Update mode').selectOption(mode);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await record('search-' + mode, async () => {
      await page.getByLabel('Search', { exact: true }).pressSequentially('ab', { delay: 30 });
      await settledSearch(page, 'ab');
    });
  }
  await page.getByLabel('Work distribution').selectOption('single');
  await record('search-indivisible', async () => {
    await page.getByLabel('Search', { exact: true }).pressSequentially('ab', { delay: 30 });
    await settledSearch(page, 'ab');
  });
  await page.screenshot({ path: fileURLToPath(new URL('search.png', directory)), fullPage: true });
  await page.getByRole('button', { name: /Suspense & retry/ }).click();
  for (const mode of ['urgent', 'transition']) {
    await page.getByRole('button', { name: 'Reset to revealed A' }).click();
    await page.getByRole('heading', { name: 'Article A' }).waitFor();
    await page.getByLabel('Replacement mode', { exact: true }).selectOption(mode);
    await record('suspense-' + mode, async () => {
      await page.getByRole('button', { name: 'Load Article B' }).click();
      // A deliberate 500 ms resource wait, not an assertion about React timing.
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: 'Resolve resource' }).click();
      await page.getByRole('heading', { name: 'Article B' }).waitFor();
    });
  }
  const metadata = {
    capturedAt: new Date().toISOString(),
    browser: await lab.browser.version(),
    viewport: { width: 1440, height: 1000 },
    cpuThrottling: 'none',
    react: '19.3.0',
    build: 'development',
    strictMode: false,
    headless: true,
    recordings,
  };
  await writeFile(new URL('capture-metadata.json', directory), JSON.stringify(metadata, null, 2));
  console.log(JSON.stringify(metadata, null, 2));
  console.log('Saved to:', fileURLToPath(directory));
} finally {
  await lab.close();
}
