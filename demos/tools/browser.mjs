import {createServer} from 'vite';
import {chromium} from 'playwright';

export async function openLab() {
  const server = await createServer({server: {port: 5175, host: '127.0.0.1', strictPort: true}});
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.BROWSER_EXECUTABLE_PATH
        ? {executablePath: process.env.BROWSER_EXECUTABLE_PATH}
        : {channel: 'msedge'}),
    });
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const close = async () => {await browser.close(); await server.close();};
    return {page, browser, close, url: 'http://127.0.0.1:5175'};
  } catch (error) {await browser?.close(); await server.close(); throw error;}
}
export async function settledSearch(page, query) {
  await page.waitForFunction(value => document.querySelector('[data-testid="search-results"]')?.dataset.query === value, query);
}
