// ============================================================
// Logging Module with Pino
// ============================================================
//
// Provides structured logging with:
// - Pretty printing in dev
// - JSON in production
// - File rotation to logs/dpm-{date}.log
// - Multiple log levels: debug, info, warn, error
// ============================================================

import pino, { type Logger as PinoLogger } from 'pino';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

const isDev = process.env.NODE_ENV !== 'production';
const LOG_LEVEL = process.env.DPM_LOG_LEVEL ?? (isDev ? 'debug' : 'info');
const LOG_DIR = process.env.DPM_LOG_DIR ?? join(process.cwd(), 'logs');

/**
 * Get the current date in YYYY-MM-DD format for log file naming
 */
function getDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Create logs directory if it doesn't exist
 */
async function ensureLogDir(): Promise<void> {
  if (!existsSync(LOG_DIR)) {
    try {
      await mkdir(LOG_DIR, { recursive: true });
    } catch (error) {
      console.error(
        `Failed to create log directory: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Create the pino logger instance
 */
function createLogger(): PinoLogger {
  const targets: pino.TransportTargetOptions[] = [];

  // Pretty printing for development
  if (isDev) {
    targets.push({
      level: LOG_LEVEL,
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    });
  } else {
    // JSON output to stdout in production
    targets.push({
      level: LOG_LEVEL,
      target: 'pino/file',
    });
  }

  // File output (both dev and prod)
  targets.push({
    level: 'info',
    target: 'pino/file',
    options: {
      destination: join(LOG_DIR, `dpm-${getDateString()}.log`),
    },
  });

  return pino(
    {
      level: LOG_LEVEL,
      serializers: {
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
        err: pino.stdSerializers.err,
      },
    },
    pino.transport({
      targets,
    })
  );
}

// Initialize logger
ensureLogDir().catch(console.error);
const _logger = createLogger();

/**
 * Get the global logger instance
 */
export function getLogger(): PinoLogger {
  return _logger;
}

/**
 * Create a scoped logger for a specific module/agent
 */
export function createLogger_Scoped(scope: string): PinoLogger {
  return _logger.child({ scope });
}

/**
 * Export convenience methods
 */
export const log = {
  debug: (msg: string, data?: any) => _logger.debug(data, msg),
  info: (msg: string, data?: any) => _logger.info(data, msg),
  warn: (msg: string, data?: any) => _logger.warn(data, msg),
  error: (msg: string, error?: Error | any) => _logger.error(error, msg),
};

export default _logger;
