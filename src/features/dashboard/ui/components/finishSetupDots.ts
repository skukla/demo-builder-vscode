/**
 * Which dashboard tiles a Finish Setup step dots, and what each dot says on hover (PL-101,
 * F307). Every dot sits on the tile whose button finishes the step: Republish for the code and
 * for skipped storefront steps, Reset for skipped pages, Manage Commerce for the root category.
 *
 * Split out of `ActionGrid.tsx`, which sat at its size limit.
 *
 * @module features/dashboard/ui/components/finishSetupDots
 */

import type { FinishSetupStatus } from '@/types/webviewPayloads';

/** Republish's hover while Republish the Code is open: why the dot is there. */
const CODE_STEP_TOOLTIP =
    'Republish needed — the live site does not serve the latest storefront code yet';

/** Republish's hover while Republish the Storefront is open: steps skipped at setup (F307). */
const SKIPPED_STEPS_TOOLTIP =
    'Republish needed — steps were skipped while the project was set up';

/** Republish's hover for the Finish Setup step that dots it: the code first, then skipped steps. */
function republishWhy(finishSetup: FinishSetupStatus | undefined): string | undefined {
    if (finishSetup?.republishDue === true) return CODE_STEP_TOOLTIP;
    return finishSetup?.republishSkipped === true ? SKIPPED_STEPS_TOOLTIP : undefined;
}

/** Which tiles a Finish Setup step dots, and the Republish hover that says why. */
export function finishSetupDots(finishSetup: FinishSetupStatus | undefined): {
    republishDue: boolean;
    republishTooltip?: string;
    resetDue: boolean;
    adminDue: boolean;
} {
    const republishTooltip = republishWhy(finishSetup);
    return {
        republishDue: republishTooltip !== undefined,
        ...(republishTooltip ? { republishTooltip } : {}),
        resetDue: finishSetup?.resetDue === true,
        adminDue: finishSetup?.adminDue === true,
    };
}

