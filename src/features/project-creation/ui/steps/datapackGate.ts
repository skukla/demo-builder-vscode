/**
 * datapackGate — a chosen datapack needs a website and store view before Continue.
 *
 * The build installs the chosen datapack only when the project names both codes for its backend
 * (`resolveInstallTarget`); with either missing the install is skipped. This reads the wizard's
 * state through that same rule, so the wizard and the build cannot disagree, and a creation install
 * can never be skipped for want of codes (step-07 W1). With no datapack chosen it asks nothing.
 *
 * @module features/project-creation/ui/steps/datapackGate
 */

import { isSetInConfigure } from './editLocks';
import { resolveInstallTarget } from '@/features/data-installer/installTarget';
import type { WizardState } from '@/types/webview';

/** The Datapacks step's lock while the strip shows Business Structure. */
export const CHOOSE_TARGET_FIRST = 'Choose a website and store view first';

/** The same in Edit, where the codes are changed in Configure (owner, Q7). */
export const SET_TARGET_IN_CONFIGURE = 'Set the website and store view in Configure first.';

type GateState = Pick<
    WizardState,
    'datapack' | 'selectedBackend' | 'componentConfigs' | 'wizardMode' | 'foundationChanged'
>;

/**
 * Whether a datapack is chosen and the build would have nowhere to install it.
 *
 * @param state - wizard state
 * @returns true when a datapack is chosen and the backend has no website and store view
 */
export function datapackLacksTarget(state: GateState): boolean {
    if (!state.datapack) return false;
    const target = resolveInstallTarget({
        componentSelections: { backend: state.selectedBackend },
        componentConfigs: state.componentConfigs,
    });
    return target === null;
}

/**
 * Why the Datapacks step is locked, or undefined when it is not.
 *
 * @param state - wizard state
 * @returns the lock line for this mode, or undefined
 */
export function datapackLockReason(state: GateState): string | undefined {
    if (!datapackLacksTarget(state)) return undefined;
    return isSetInConfigure(state) ? SET_TARGET_IN_CONFIGURE : CHOOSE_TARGET_FIRST;
}
