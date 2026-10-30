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
 * The projects list's "Copy from a project": it asks which project in that
 * screen's modal, then opens the wizard (picker-to-modal).
 */
export const COPY_SETTINGS_OPERATION_ID = 'copy-settings';

/**
 * Changing where a project's integrations deploy. Project-scoped, like the
 * storefront buttons, so it names the operation rather than a target.
 */
export const DESTINATION_OPERATION_ID = 'destination';

/**
 * A datapack import or removal. One job at a time (the Data Installer watches a
 * single activation), so the id names the operation rather than the pack.
 */
export const DATAPACK_OPERATION_ID = 'datapack';

/**
 * "Save store changes to this pack": a pack's flyout writes the store's copy of it into the
 * library. One at a time, like an import, so it names the operation rather than the pack.
 */
export const DATAPACK_SAVE_OPERATION_ID = 'datapack-save';

/** "Clear demo data" (datapack-engine step 10): the chosen stores cleared. One at a time. */
export const DEMO_DATA_CLEAR_OPERATION_ID = 'demo-data-clear';

/** Applying an edit from the Manage APIs modal. */
export const CONSOLE_APIS_OPERATION_ID = 'console-apis';

/** Regenerating a project's AI files. */
export const AI_FILES_OPERATION_ID = 'ai-files';

/**
 * Configure's storefront Republish. Started from the prompt a save raises, and told
 * in the Configure screen's progress modal while that screen is open.
 */
export const CONFIGURE_REPUBLISH_OPERATION_ID = 'configure-republish-storefront';

/** A project deletion, keyed by the project being deleted. */
export function deleteOperationId(projectName: string): string {
    return `delete:${projectName}`;
}

/**
 * Applying the updates the SC left ticked in the Updates modal (PL-80). One list
 * across every project, so it names the operation rather than a target.
 */
export const UPDATES_OPERATION_ID = 'apply-updates';
