/**
 * The handler for a stack (architecture) change on WelcomeStep — the single
 * choke point `stackHelpers.buildStackChangeStateReset` names.
 *
 * A plain builder read in render, like `buildAreaWalk`: it holds no state and
 * registers no effect, so a `use*` name would claim a hook that is not one, and
 * memoising it would change the handler's identity across renders, which the
 * container never did.
 *
 * Moved out of WizardContainer.tsx on 2026-10-08 (EDS-8).
 *
 * @module features/project-creation/ui/wizard/architectureChange
 */

import type { Dispatch, SetStateAction } from 'react';
import {
    filterComponentConfigsForStackChange,
    buildStackChangeStateReset,
} from '../helpers/stackHelpers';
import { webviewLogger } from '@/core/ui/utils/webviewLogger';
import type { Stack } from '@/types/stacks';
import type { WizardState, WizardStep } from '@/types/webview';

const log = webviewLogger('architectureChange');

/**
 * Called when user changes architecture (stack) on WelcomeStep
 * Intelligently filters dependent state based on component overlap between stacks
 *
 * Components REMOVED by the new stack → Clear their configs
 * Components RETAINED in the new stack → Keep their configs
 * Components NEW in the new stack → Will be initialized with defaults later
 *
 * Note: Import mode fast-forward is controlled by comparing state.selectedStack
 * with importedSettings.selectedStack - no flag needed.
 *
 * @param stacks - the loaded stack catalog
 * @param componentConfigs - the wizard's current per-component configs
 * @param setCompletedSteps - resets the completed steps to welcome only
 * @param setState - the wizard state setter
 * @returns the `onArchitectureChange` handler WelcomeStep receives
 */
export function buildArchitectureChangeHandler({
    stacks,
    componentConfigs,
    setCompletedSteps,
    setState,
}: {
    stacks: Stack[];
    componentConfigs: WizardState['componentConfigs'];
    setCompletedSteps: Dispatch<SetStateAction<WizardStep[]>>;
    setState: Dispatch<SetStateAction<WizardState>>;
}): (oldStackId: string, newStackId: string) => void {
    return (oldStackId: string, newStackId: string) => {
        log.info(`Architecture changed: ${oldStackId} → ${newStackId}`);

        // Find the old and new stack definitions
        const oldStack = stacks?.find((s) => s.id === oldStackId);
        const newStack = stacks?.find((s) => s.id === newStackId);

        if (!newStack) {
            log.warn(`New stack not found: ${newStackId}`);
            return;
        }

        // Filter component configs - retain configs for components that exist in both stacks
        const filteredConfigs = filterComponentConfigsForStackChange(
            oldStack,
            newStack,
            componentConfigs || {},
        );

        log.info(
            `Retained configs for components: ${Object.keys(filteredConfigs).join(', ') || 'none'}`,
        );

        // Stack change resets all steps except welcome (user must re-traverse)
        // Consistent behavior across all wizard modes (create, import, edit)
        setCompletedSteps(['welcome']);

        // Update state with filtered configs
        // Clear EDS-specific state since it's architecture-dependent
        // Preserve: projectName, selectedBrand, Adobe auth/org (still valid)
        setState((prev) => ({
            ...prev,
            componentConfigs: filteredConfigs,
            // Clear architecture-dependent EDS state/caches AND the cached config-tile
            // validity verdicts, so a stale ✓ tile can't survive a stack change.
            ...buildStackChangeStateReset(),
        }));
    };
}
