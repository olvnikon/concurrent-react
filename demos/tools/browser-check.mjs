import assert from 'node:assert/strict';
import { openLab, settledSearch } from './browser.mjs';

const lab = await openLab();
const { page, url } = lab;
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(url);
  for (const mode of ['tasks', 'blocking', 'microtasks']) {
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.getByLabel('Scheduling').selectOption(mode);
    await page.getByRole('button', { name: 'Run work', exact: true }).click();
    if (mode === 'tasks') {
      // Scripted input checks the live interaction, not a particular slice duration.
      await page.getByRole('button', { name: 'Tap while working', exact: true }).click();
      assert.match(await page.locator('.cards').textContent(), /1 taps handled/);
      assert.equal(await page.getByRole('status').textContent(), 'Working…');
    }
    // Wait for the whole run, not an early slice that happens to include "120".
    await page.getByRole('status').filter({ hasText: 'Ready' }).waitFor();
    assert.match(await page.locator('.log').textContent(), /–1200$/);
  }
  await page.getByRole('button', { name: /Fiber & publication/ }).click();
  await page.getByRole('button', { name: 'Step one unit' }).click();
  assert.equal(await page.getByTestId('fiber-current').textContent(), 'Previously committed UI');
  await page.getByRole('button', { name: 'Discard draft' }).click();
  assert.equal(await page.getByTestId('fiber-current').textContent(), 'Previously committed UI');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('button', { name: 'Finish draft' }).click();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  assert.match(await page.getByTestId('fiber-current').textContent(), /Row B/);
  await page.getByRole('button', { name: /Lanes & rebasing/ }).click();
  await page.getByRole('button', { name: 'Process urgent lane' }).click();
  assert.equal(await page.getByTestId('queue-state').textContent(), '2');
  await page.getByRole('button', { name: 'Process transition lane' }).click();
  assert.equal(await page.getByTestId('queue-state').textContent(), '23');

  await page.getByRole('button', { name: /Concurrent search/ }).click();
  await page.getByLabel('Search', { exact: true }).fill('ordinary');
  await settledSearch(page, 'ordinary');
  await page.getByLabel('Update mode').selectOption('transition');
  await page.getByLabel('CPU per row').selectOption('4');
  await page.getByLabel('Search', { exact: true }).pressSequentially('ab', { delay: 30 });
  await settledSearch(page, 'ab');
  assert.equal(await page.locator('.results li').count(), 120);
  await page.getByLabel('Work distribution').selectOption('single');
  await page.getByLabel('Search', { exact: true }).fill('single');
  await settledSearch(page, 'single');

  await page.getByRole('button', { name: /Suspense & retry/ }).click();
  const modelCurrent = page.getByTestId('suspense-model-current');
  const modelCandidate = page.getByTestId('suspense-model-candidate');
  await page.getByRole('button', { name: 'Create pending B', exact: true }).click();
  await page.getByRole('button', { name: 'Render / Retry model', exact: true }).click();
  assert.match(await modelCandidate.textContent(), /fallback: Loading/);
  assert.equal(await modelCurrent.textContent(), 'Article A');
  await page.getByRole('button', { name: 'Discard candidate', exact: true }).click();
  assert.equal(await modelCurrent.textContent(), 'Article A');
  await page.getByRole('button', { name: 'Render / Retry model', exact: true }).click();
  await page.getByRole('button', { name: 'Commit candidate', exact: true }).click();
  assert.match(await modelCurrent.textContent(), /Loading/);
  await page.getByRole('button', { name: 'Resolve model resource', exact: true }).click();
  await page.getByTestId('suspense-model-log').filter({ hasText: 'retry queued' }).waitFor();
  assert.match(await modelCurrent.textContent(), /Loading/);
  await page.getByRole('button', { name: 'Render / Retry model', exact: true }).click();
  assert.equal(await modelCandidate.textContent(), 'content: Article B');
  assert.match(await modelCurrent.textContent(), /Loading/);
  await page.getByRole('button', { name: 'Commit candidate', exact: true }).click();
  assert.equal(await modelCurrent.textContent(), 'Article B');
  await page.getByRole('button', { name: 'Reset model', exact: true }).click();
  await page.getByLabel('Model replacement mode', { exact: true }).selectOption('transition');
  await page.getByRole('button', { name: 'Create pending B', exact: true }).click();
  await page.getByRole('button', { name: 'Render / Retry model', exact: true }).click();
  assert.equal(await modelCandidate.textContent(), 'retained: Article A');
  await page.getByRole('button', { name: 'Commit candidate', exact: true }).click();
  assert.equal(await modelCurrent.textContent(), 'Article A');
  await page.getByRole('button', { name: 'Reject model resource', exact: true }).click();
  await page.getByTestId('suspense-model-log').filter({ hasText: 'retry queued' }).waitFor();
  await page.getByRole('button', { name: 'Render / Retry model', exact: true }).click();
  assert.match(await modelCandidate.textContent(), /Could not load Article B/);
  assert.equal(await modelCurrent.textContent(), 'Article A');

  await page.getByRole('heading', { name: 'Article A' }).waitFor();
  await page.getByRole('button', { name: 'Load Article B' }).click();
  await page.getByTestId('fallback').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Resolve resource' }).click();
  await page.getByRole('heading', { name: 'Article B' }).waitFor();
  await page.getByRole('button', { name: 'Reset to revealed A' }).click();
  await page.getByRole('heading', { name: 'Article A' }).waitFor();
  await page.getByLabel('Replacement mode', { exact: true }).selectOption('transition');
  await page.getByRole('button', { name: 'Load Article B' }).click();
  await page.getByRole('status').filter({ hasText: 'Transition pending' }).waitFor();
  // Allow the pending render to be attempted; assert state, not exact scheduling time.
  await page.waitForTimeout(350);
  assert.equal(await page.getByRole('heading', { name: 'Article A' }).isVisible(), true);
  assert.equal(await page.getByTestId('fallback').isVisible(), false);
  await page.getByRole('button', { name: 'Resolve resource' }).click();
  await page.getByRole('heading', { name: 'Article B' }).waitFor();
  await page.getByRole('button', { name: 'Reset to pending mount' }).click();
  await page.getByTestId('fallback').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Reject resource' }).click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').textContent(), /Could not load Article A/);
  assert.deepEqual(errors, []);
  console.log(
    'PASS five lesson browser rehearsal, search variants, MiniSuspense phases/discard/rejection, real Suspense fallback/retention/rejection',
  );
  console.log(
    'Browser:',
    await lab.browser.version(),
    'React:',
    await page.locator('.environment').innerText(),
  );
} finally {
  await lab.close();
}
