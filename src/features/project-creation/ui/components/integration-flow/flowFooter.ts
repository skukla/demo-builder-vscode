/**
 * flowFooter — the Add Integration flow's footer: Back at its start (step-07 Win3), the rest beside
 * Cancel, the main one last. Split out of `AddIntegrationFlowModal` when its windows moved onto the
 * Steps layout, which keeps the windows and which stage each is drawn in.
 *
 * @module features/project-creation/ui/components/integration-flow/flowFooter
 */

import type { ApiAccessProblem } from './apiAccessProblem';
import type { FlowMode } from './flowStages';
import type { UseIntegrationFlowReturn } from './useIntegrationFlow';
import type { DialogOutcome } from '@/core/ui/components/ui/DialogOutcome';
import type { ActionButton } from '@/core/ui/components/ui/Modal';

/** The footer: Back at its start (step-07 Win3), the rest beside Cancel, the main one last. */
export interface Footer {
    start: ActionButton[];
    actions: ActionButton[];
}

const NO_BUTTONS: ActionButton[] = [];

function backOf(flow: UseIntegrationFlowReturn): ActionButton {
    return { label: 'Back', variant: 'secondary', onPress: flow.onBack, isDisabled: !flow.canGoBack };
}

/**
 * The buttons beside Cancel. After a failed read of the APIs, an add can still finish, since its
 * picks are optional and can change later in Manage APIs, so the put-it-right button sits before
 * it. Editing picks has nothing to save without the list.
 */
function footerOf(flow: UseIntegrationFlowReturn, mode: FlowMode, problem: ApiAccessProblem | undefined): ActionButton[] {
    const main: ActionButton = {
        label: flow.continueLabel,
        variant: 'accent',
        onPress: flow.onContinue,
        isDisabled: !flow.canContinue,
    };
    if (!problem) return [main];
    const fix = problem.action;
    if (mode === 'add') return fix ? [{ ...fix, variant: 'secondary' }, main] : [main];
    return fix ? [{ ...fix, variant: 'accent' }] : NO_BUTTONS;
}

/** A destination stage's outcome has nowhere to continue to: what it offers, the main one last. */
function outcomeFooter(outcome: DialogOutcome): ActionButton[] {
    const { actions } = outcome;
    return actions.map(
        ({ label, onPress }, index): ActionButton => ({
            label,
            onPress,
            variant: index === actions.length - 1 ? 'accent' : 'secondary',
        }),
    );
}

/** The footer: none in a stage's silent wait, an outcome's own, else the journey's; Back at the start. */
export function journeyFooter(
    flow: UseIntegrationFlowReturn,
    mode: FlowMode,
    problem: ApiAccessProblem | undefined,
    stage: { waiting: boolean; outcome: DialogOutcome | null },
): Footer {
    if (stage.waiting) return { start: NO_BUTTONS, actions: NO_BUTTONS };
    const actions = stage.outcome ? outcomeFooter(stage.outcome) : footerOf(flow, mode, problem);
    return { start: [backOf(flow)], actions };
}
