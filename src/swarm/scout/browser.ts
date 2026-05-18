// ============================================================
// Scout Browser Pool — Shared Playwright Instance with Stealth
// ============================================================
//
// Manages a single Chromium browser instance shared across all scouts.
// Uses playwright-extra with stealth plugin to evade anti-bot detection.
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

/** Stealth browser context options to evade anti-bot detection */
const STEALTH_CONTEXT_OPTIONS = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 800 },
  locale: 'en-US',
  timezoneId: 'America/New_York',
  permissions: ['geolocation'],
  colorScheme: 'light' as const,
  extraHTTPHeaders: {
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  },
};

/** Get or create the shared browser instance */
export async function getBrowser(): Promise<Browser> {
  // Never launch browser in test environment
  if (process.env.NODE_ENV === 'test') {
    throw new Error('Browser not available in test environment');
  }

  if (_browser && _browser.isConnected()) return _browser;

  logger.info('Launching stealth browser');
  _browser = await chromium.launch({
    headless: config.playwrightHeadless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--no-first-run',
      '--safebrowsing-disable-auto-update',
      '--hide-scrollbars',
      '--mute-audio',
    ],
  });

  _context = await _browser.newContext(STEALTH_CONTEXT_OPTIONS);

  // Add stealth scripts to evade common detection patterns
  await _context.addInitScript(() => {
    // Override navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => false });

    // Mock plugins to look like a real browser
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    // Mock languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });

    // Override permissions query
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: PermissionDescriptor) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters);

    // Remove automation-related globals using proper type checking
    const win = window as unknown as Record<string, unknown>;
    delete win.__playwright;
    delete win.__pw_manual;
    delete win.__PW_inspect;

    // Mock Chrome runtime
    win.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
  });

  // Register signal handlers ONCE
  if (!_signalHandlersRegistered) {
    _signalHandlersRegistered = true;

    process.on('exit', () => {
      if (_browser) {
        try { _browser.close(); } catch { /* ignore */ }
      }
    });

    // Proper signal handler with error handling and logging
    const handleSignal = async (signal: string) => {
      try {
        logger.info(`Received ${signal}, closing browser gracefully`);
        await closeBrowser();
        process.exit(0);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message, signal }, `Failed to close browser on ${signal}`);
        process.exit(1);
      }
    };

    // Attach handlers with proper error catching
    process.on('SIGTERM', () => {
      handleSignal('SIGTERM').catch(error => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message }, 'Unhandled error in SIGTERM handler');
      });
    });

    process.on('SIGINT', () => {
      handleSignal('SIGINT').catch(error => {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message }, 'Unhandled error in SIGINT handler');
      });
    });

    // Catch unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      logger.error({ reason: message, promise: String(promise) }, 'Unhandled promise rejection');
    });

    // Catch uncaught exceptions
    process.on('uncaughtException', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, stack: error instanceof Error ? error.stack : undefined }, 'Uncaught exception');
      process.exit(1);
    });
  }

  return _browser;
}

/** Get a fresh page from the browser context with stealth protections */
export async function getPage(): Promise<Page> {
  if (!_context) {
    await getBrowser();
  }

  const page = await _context!.newPage();
  page.setDefaultTimeout(config.playwrightTimeoutMs);
  page.setDefaultNavigationTimeout(config.playwrightTimeoutMs);

  // Block unnecessary resource types for faster loading
  await page.route('**/*', async (route, request) => {
    const type = request.resourceType();
    if (['font', 'media', 'websocket', 'manifest'].includes(type)) {
      await route.abort();
    } else {
      await route.continue();
    }
  });

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
