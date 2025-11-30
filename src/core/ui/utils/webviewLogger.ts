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

// Check if we're in development mode
// In webpack builds, this is replaced with actual value at compile time
const isDev = process.env.NODE_ENV !== 'production';

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

/**
 * Type for the logger instance returned by webviewLogger
 */
export type WebviewLogger = ReturnType<typeof webviewLogger>;
