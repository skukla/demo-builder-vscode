/**
 * What Edit leaves to Configure.
 *
 * Edit changes what a project is built from: package, stack, backend, Adobe
 * project, repository and site, integrations, datapack. Configure changes the
 * settings of the project as it stands. Four things used to be changeable in
 * both, each behaving differently depending on the screen; in Edit they are now
 * shown and not changeable:
 *
 *  - the project name (Configure also renames the folder; Edit did not);
 *  - the Commerce connection, store codes and catalog settings;
 *  - the block libraries (Configure removes an unticked one; Edit did not).
 *
 * The Commerce settings and block libraries come back when the package or the
 * backend changes, because that change resets them and the new foundation needs
 * them chosen again (`foundationChanged`).
 *
 * @module features/project-creation/ui/steps/editLocks
 */

import type { WizardState } from '@/types/webview';

/** Shown under the project name in Edit. */
export const RENAME_IN_CONFIGURE = 'Rename in Configure.';

/** The title of the notice Edit shows where a setting belongs to Configure. */
export const SET_IN_CONFIGURE_TITLE = 'Changed in Configure';

/** Shown in place of the Commerce settings form in Edit. */
export const COMMERCE_SET_IN_CONFIGURE =
    'The connection, store codes and catalog settings are changed in Configure. ' +
    'They open here again if you change the backend or the demo package.';

/** Shown above the block libraries in Edit. */
export const BLOCK_LIBRARIES_SET_IN_CONFIGURE =
    'Block libraries are added and removed in Configure.';

/**
 * Whether the project name is shown and not changeable.
 *
 * @param state - wizard state
 * @returns true in Edit
 */
export function isNameSetInConfigure(state: Pick<WizardState, 'wizardMode'>): boolean {
    return state.wizardMode === 'edit';
}

/**
 * The line under the project name: where Edit renames it, else the folder it makes.
 *
 * @param state - wizard state
 * @returns the description, or undefined before a name is typed
 */
export function projectNameDescription(
    state: Pick<WizardState, 'wizardMode' | 'projectName'>,
): string | undefined {
    if (isNameSetInConfigure(state)) return RENAME_IN_CONFIGURE;
    return state.projectName ? `Folder: ${state.projectName}` : undefined;
}

/**
 * Whether the Commerce settings and block libraries are shown and not changeable.
 *
 * @param state - wizard state
 * @returns true in Edit until the package or backend changes
 */
export function isSetInConfigure(
    state: Pick<WizardState, 'wizardMode' | 'foundationChanged'>,
): boolean {
    return state.wizardMode === 'edit' && state.foundationChanged !== true;
}
