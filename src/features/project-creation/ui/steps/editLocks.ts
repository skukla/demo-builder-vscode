/**
 * What Edit leaves to Configure.
 *
 * Edit changes what a project is built from: package, stack, backend, Adobe
 * project, repository and site, integrations, datapack. Configure changes the
 * settings of the project as it stands. These used to be changeable in both,
 * each behaving differently depending on the screen; in Edit they are now not
 * changeable:
 *
 *  - the Commerce connection, store codes and catalog settings, whose three steps
 *    are left out of Edit's strip altogether (Backend says why, once, linking to
 *    Configure) while the summary still shows their values (owner, 2026-10-17);
 *  - the block libraries (Configure removes an unticked one; Edit did not). Their
 *    step is left out too, with no line in its place: the summary shows them
 *    (owner, 2026-10-17).
 *
 * The project name was a third, locked because Edit changed the label and not the
 * folder. Edit now renames with the same rename Configure uses, after the Edit
 * (`editRenameTo`, `renameAfterEdit`), so it is changeable in both again.
 *
 * The Commerce settings and block libraries come back when the package or the
 * backend changes, because that change resets them and the new foundation needs
 * them chosen again (`foundationChanged`).
 *
 * @module features/project-creation/ui/steps/editLocks
 */

import type { WizardState } from '@/types/webview';

/**
 * Edit's quiet line under the backend cards, where the Commerce settings steps are
 * left out: the sentence, then its link (SetInConfigureNote; owner, 2026-10-17).
 */
export const COMMERCE_SET_IN_CONFIGURE = 'Connection, store and catalog settings are changed in';
export const PROJECT_CONFIGURATION_LINK = 'project configuration';

/**
 * The line under the project name: the folder it makes, or in Edit moves to. Edit
 * renames with the same rename Configure uses, after the Edit (owner, 2026-10-17).
 *
 * @param state - wizard state
 * @returns the description, or undefined before a name is typed
 */
export function projectNameDescription(state: Pick<WizardState, 'projectName'>): string | undefined {
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
