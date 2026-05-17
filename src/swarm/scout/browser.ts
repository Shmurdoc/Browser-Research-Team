// ============================================================
// Scout Browser Pool — Shared Playwright Instance
// ============================================================
//
// Manages a single Chromium browser instance shared across all scouts.
// Prevents browser spawn overhead and resource leaks.
// Auto-closes on process exit with proper async handling.
// ============================================================

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { config } from '../../config.js';
import { createLogger_Scoped } from '../../logging/index.js';

const logger = createLogger_Scoped('scout:browser');

let _browser: Browser | null = null;
let _context: BrowserContext | null = null;
let _isShuttingDown = false;
let _signalHandlersRegistered = false;

/** Get or create the shared browser instance */
export async function getBrowser(): Promise<Browser> {
  // Never launch browser in test environment
  if (process.env.NODE_ENV === 'test') {
    throw new Error('Browser not available in test environment');
  }

  if (_browser && _browser.isConnected()) return _browser;

  logger.info('Launching browser');
  _browser = await chromium.launch({
    headless: config.playwrightHeadless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
    ],
  });

  _context = await _browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  });

  // Register signal handlers ONCE (not on every getBrowser call)
  if (!_signalHandlersRegistered) {
    _signalHandlersRegistered = true;

    // 'exit' handler must be synchronous — it cannot do async work
    process.on('exit', () => {
      // Best-effort sync cleanup (browser.close is sync-ish in Chromium)
      if (_browser) {
        try { _browser.close(); } catch { /* ignore */ }
      }
    });

    // SIGTERM/SIGINT can do async cleanup
    const shutdown = async () => {
      await closeBrowser();
    };
    process.on('SIGTERM', () => { void shutdown(); });
    process.on('SIGINT', () => { void shutdown(); });
  }

  return _browser;
}

/** Get a fresh page from the browser context */
export async function getPage(): Promise<Page> {
  if (!_context) {
    await getBrowser();
  }

  const page = await _context!.newPage();
  page.setDefaultTimeout(config.playwrightTimeoutMs);
  page.setDefaultNavigationTimeout(config.playwrightTimeoutMs);
  return page;
}

/** Close a page (release back to OS) */
export async function releasePage(page: Page): Promise<void> {
  try {
    await page.close();
  } catch {
    // Page already closed or browser shut down
  }
}

/** Close the entire browser instance */
export async function closeBrowser(): Promise<void> {
  if (_isShuttingDown) return;
  _isShuttingDown = true;

  logger.info('Closing browser');

  if (_context) {
    try { await _context.close(); } catch { /* ignore */ }
    _context = null;
  }

  if (_browser) {
    try { await _browser.close(); } catch { /* ignore */ }
    _browser = null;
  }
}

/** Check if browser is running */
export function isBrowserRunning(): boolean {
  return _browser !== null && _browser.isConnected();
}
