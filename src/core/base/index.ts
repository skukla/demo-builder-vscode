/**
 * Shared Base Classes
 *
 * Provides base command classes for standard commands and webview commands.
 * All feature commands extend these base classes.
 */

export { BaseCommand } from './baseCommand';
export { BaseWebviewCommand } from './baseWebviewCommand';
// Note: BaseHandlerRegistry removed in Step 3: Handler Registry Simplification
// Use object literal handler maps with dispatchHandler() instead
