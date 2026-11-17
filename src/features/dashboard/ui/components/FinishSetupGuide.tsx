/**
 * The project dashboard's Finish Setup guide (PL-101): "Finish Setup: <project>", the steps a run
 * left, with the integrations' Demo Setup flow and buttons.
 *
 * Reused, not rebuilt: the body is `SetupGuide` (the steps on the left; Where, Set, Then, Why;
 * Check All Steps, Open Commerce Admin, Apply This Step, Mark as Done), shared with the
 * integration's `SetupGuideModal`, with its requests aimed at the project's Finish Setup handlers.
 *
 * @module features/dashboard/ui/components/FinishSetupGuide
 */

import React from 'react';
import type { FinishSetupControls } from '../hooks/useFinishSetup';
import { SetupGuide } from './integrations/SetupGuide';
import type { SetupRequestTarget } from './integrations/useSetupChecklist';

/**
 * Where the guide's requests go: the open project's Finish Setup handlers, which need nothing
 * beside the step. One object for every render (a hook dependency).
 */
const FINISH_SETUP_TARGET: SetupRequestTarget = {
    messages: {
        setStep: 'setFinishSetupStep',
        check: 'checkFinishSetupSteps',
        prepare: 'prepareFinishSetupChecks',
    },
    payload: {},
};

/**
 * The guide, mounted only while open and while there are steps to show.
 *
 * @param props - the guide's controls, and the project's name for its title
 * @returns the dialog, or null
 */
export function FinishSetupGuide({
    controls,
    projectName,
}: {
    controls: FinishSetupControls;
    projectName: string;
}): React.ReactElement | null {
    const items = controls.status?.items;
    if (!controls.isOpen || !items || items.length === 0) return null;
    return (
        <SetupGuide
            title={`Finish Setup: ${projectName}`}
            items={items}
            target={FINISH_SETUP_TARGET}
            run={controls.run}
            applies={controls.run !== undefined}
            onOpenAdmin={controls.openAdmin}
            onClose={controls.close}
        />
    );
}
