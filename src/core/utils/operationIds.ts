/**
 * The ids an operation's progress is keyed by (PL-59).
 *
 * The screen that starts an operation and the extension that runs it must name it
 * the SAME thing, or the modal follows an operation nobody is running. They are
 * built here, from values both sides hold, rather than typed out on each side —
 * a webview may import this, as it imports nothing from a feature.
 *
 * An integration's operations are keyed by its component id, which is already
 * unique; these are for the operations that have no such id of their own.
 *
 * @module core/utils/operationIds
 */

/**
 * A reset, keyed by the project it resets — the projects list can start one for
 * any project it lists, so "the reset" alone would not say which.
 */
export function resetOperationId(projectName: string): string {
    return `reset:${projectName}`;
}

/**
 * The dashboard's storefront buttons. One project is open at a time there, so
 * these need no key of their own — they name the operation, not the target.
 */
export const SYNC_OPERATION_ID = 'sync-storefront';
export const BLOCK_LIBRARY_OPERATION_ID = 'block-library';
export const REPUBLISH_OPERATION_ID = 'republish';

/**
 * Changing where a project's integrations deploy. Project-scoped, like the
 * storefront buttons, so it names the operation rather than a target.
 */
export const DESTINATION_OPERATION_ID = 'destination';

/** A project deletion, keyed by the project being deleted. */
export function deleteOperationId(projectName: string): string {
    return `delete:${projectName}`;
}
