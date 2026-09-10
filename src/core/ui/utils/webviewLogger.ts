/**
 * WebviewLogger - Lightweight logging for webview (browser) context
 *
 * Since webviews run in a browser context, they cannot use the VS Code
 * Logger infrastructure directly. This logger provides:
 * - Consistent formatting with context prefix
 * - Dev-only logging for non-error messages (errors always log)
 * - Simple API matching Logger interface
 *
 * Usage:
 * ```typescript
 * import { webviewLogger } from '@/core/ui/utils/webviewLogger';
 *
 * // Create a logger for your component
 * const log = webviewLogger('MyComponent');
 *
 * log.info('Component mounted');
 * log.debug('State updated', { count: 5 });
 * log.warn('Deprecated prop used');
 * log.error('Failed to load data', error);
 * ```
 */

/* eslint-disable no-console -- This is a browser-context logger where console is the only available output */

// Check if we're in development mode.
// esbuild defines process.env.NODE_ENV at bundle time (esbuild.config.js).
//
// `test` is excluded alongside `production` (added 2026-08-29). This logger's
// stated purpose is DEV-ONLY logging for non-error messages, and an automated
// test run is not a dev session: thirteen webview modules use it, and under
// Jest — where NODE_ENV is 'test' — they logged on every render. That was 48 of
// the console-gate's events, i.e. the code under test narrating itself into the
// suite output. Errors are unaffected: `error` logs regardless of this flag.
const isDev = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

/**
 * Create a logger instance for a specific context/component
 */
export function webviewLogger(context: string) {
    const prefix = `[${context}]`;

    return {
        /**
         * Log informational messages (dev only)
         */
        info: (message: string, ...args: unknown[]) => {
            if (isDev) {
                if (args.length > 0) {
                    console.log(prefix, message, ...args);
                } else {
                    console.log(prefix, message);
                }
            }
        },

        /**
         * Log debug messages (dev only)
         */
        debug: (message: string, ...args: unknown[]) => {
            if (isDev) {
                if (args.length > 0) {
                    console.debug(prefix, message, ...args);
                } else {
                    console.debug(prefix, message);
                }
            }
        },

        /**
         * Log warning messages (dev only)
         */
        warn: (message: string, ...args: unknown[]) => {
            if (isDev) {
                if (args.length > 0) {
                    console.warn(prefix, message, ...args);
                } else {
                    console.warn(prefix, message);
                }
            }
        },

        /**
         * Log error messages (always, even in production)
         * Errors are critical and should always be visible for debugging
         */
        error: (message: string, error?: Error | unknown) => {
            if (error instanceof Error) {
                console.error(prefix, message, error.message);
            } else if (error !== undefined) {
                console.error(prefix, message, error);
            } else {
                console.error(prefix, message);
            }
        },
    };
}
