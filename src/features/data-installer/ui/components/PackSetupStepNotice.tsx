/**
 * The one Admin step an installed pack can leave (datapack-engine step 12), in its flyout: the
 * store shares its root category with another store, so the pack's categories are a root of
 * their own, and only the SC can point the store at it. The install asked; "Skip for now" left
 * the step here.
 *
 * Drawn as the setup guide draws a step (`SetupStepFacts`: Where, values to copy, Then, Why),
 * under the house notice (`InlineNotice`; the facts are a list, which its text line cannot hold), with the step's two buttons: Open the Admin (the
 * dashboard's own `openAdminPanel`) and Check (`check-datapack-setup-step`, read-only against the
 * store; it marks the step done with no reinstall). Nothing shows when the pack left no step.
 *
 * @module features/data-installer/ui/components/PackSetupStepNotice
 */

import { Button } from '@adobe/react-spectrum';
import React, { useCallback, useEffect } from 'react';
import type { DatapackSetupStep } from '../../types';
import { type DataInstallerFailure, useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { SetupStepFacts } from '@/core/ui/components/ui/SetupStepFacts';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { DatapackId } from '@/types/datapack';

/** A Check whose request gave up: the extension may still have finished and recorded it. */
export const CHECK_NO_ANSWER = "Demo Builder didn't get an answer in time. The check may still have finished; press Check to try again.";

/** Why a Check could not say, in the SC's words: the handler's own sentence, never transport text. */
function checkFailureText(failure: DataInstallerFailure | null): string | undefined {
    if (!failure) return undefined;
    return failure.unanswered ? CHECK_NO_ANSWER : failure.message;
}

export interface PackSetupStepNoticeProps {
    /** The pack the open project holds, installed by Demo Builder's engine. */
    id: DatapackId;
}

export function PackSetupStepNotice({ id }: PackSetupStepNoticeProps): React.JSX.Element | null {
    const read = useDataInstallerRequest<DatapackSetupStep>('get-datapack-setup-step');
    const check = useDataInstallerRequest<DatapackSetupStep>('check-datapack-setup-step');
    const load = read.load;
    useEffect(() => {
        load({ datapackName: id.name, version: id.version });
    }, [load, id.name, id.version]);
    const runCheck = check.load;
    const onCheck = useCallback(() => runCheck({ datapackName: id.name, version: id.version }), [runCheck, id.name, id.version]);
    const openAdmin = useCallback(() => webviewClient.postMessage('openAdminPanel', {}), []);

    // The check's answer, once there is one, is the step as it now stands.
    const step = (check.value ?? read.value)?.step;
    if (!step) return null;
    if (step.state === 'done') {
        return <InlineNotice tone="success" title={step.title} testId="pack-setup-step">{step.note}</InlineNotice>;
    }
    return (
        <div data-testid="pack-setup-step">
            <InlineNotice title={step.title} hint={checkFailureText(check.failure) ?? step.note}>
                One step is left in the Admin for this pack.
            </InlineNotice>
            <SetupStepFacts item={step} />
            <div className="db-drawer-actions">
                <Button variant="secondary" onPress={openAdmin}>
                    Open the Admin
                </Button>
                <Button variant="accent" onPress={onCheck} isDisabled={check.loading}>
                    {check.loading ? 'Checking' : 'Check'}
                </Button>
            </div>
        </div>
    );
}
