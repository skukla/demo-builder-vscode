/**
 * The pack's one Admin step (datapack-engine step 12): its read, its Check, and the two things
 * the catalog mounts, the side panel's quiet line (`PackSetupStepLine`) and the step's dialog
 * (`PackSetupStepDialog`).
 *
 * The dialog is mounted beside the flyout, never inside it, as the catalog mounts its import
 * modal and the integrations screen its setup guide: a dialog inside the drawer is the shape this
 * screen rejected (the drawer's Tab wrap and Escape would act on the dialog too). So the line and
 * the dialog share one read and one Check here, and the catalog hands the line to the flyout.
 *
 * The Check's answer, once there is one, is the step as it now stands. Answers carry the pack they
 * are for, and one for another pack (the SC moved on while it ran) is never shown as this one's.
 * A Check that gets no answer says so in plain words (the webview's transport text named a
 * message type); a refusal keeps the handler's own sentence.
 *
 * @module features/data-installer/ui/hooks/usePackSetupStep
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { DatapackSetupStep } from '../../types';
import { PackSetupStepDialog } from '../components/PackSetupStepDialog';
import { PackSetupStepLine } from '../components/PackSetupStepLine';
import { type DataInstallerFailure, useDataInstallerRequest } from './useDataInstallerRequest';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';
import type { DatapackId } from '@/types/datapack';

/** A Check whose request gave up: the extension may still have finished and recorded it. */
export const CHECK_NO_ANSWER = "Demo Builder didn't get an answer in time. The check may still have finished; press Check to try again.";

/** What the catalog mounts: the flyout's line, and the dialog beside the flyout. */
export interface PackSetupStepView {
    line: React.JSX.Element | null;
    dialog: React.JSX.Element | null;
}

const NONE: PackSetupStepView = { line: null, dialog: null };

/** Why a Check could not say, in the SC's words: the handler's own sentence, never transport text. */
function failureText(failure: DataInstallerFailure | null): string | undefined {
    if (!failure) return undefined;
    return failure.unanswered ? CHECK_NO_ANSWER : failure.message;
}

/** The step of the first answer that is for this pack. */
function stepFor(answers: Array<DatapackSetupStep | null>, pack: DatapackId | undefined): SetupChecklistItem | null {
    const mine = answers.find((each) => each && pack && each.datapackName === pack.name && each.version === pack.version);
    return mine?.step ?? null;
}

/**
 * @param pack - the pack the open project holds, installed by Demo Builder's engine, with its
 *   detail loaded; undefined shows nothing and asks nothing
 */
export function usePackSetupStep(pack: DatapackId | undefined): PackSetupStepView {
    const read = useDataInstallerRequest<DatapackSetupStep>('get-datapack-setup-step');
    const check = useDataInstallerRequest<DatapackSetupStep>('check-datapack-setup-step');
    const [showing, setShowing] = useState(false);
    /** The pack the last Check was for, so its failure is never shown on another. */
    const [checkedFor, setCheckedFor] = useState<string | undefined>(undefined);
    const name = pack?.name;
    const version = pack?.version;
    const key = name && version ? `${name}@${version}` : undefined;

    const loadRead = read.load;
    useEffect(() => {
        setShowing(false);
        if (name && version) loadRead({ datapackName: name, version });
    }, [loadRead, name, version]);

    const runCheck = check.load;
    const onCheck = useCallback((): void => {
        if (!name || !version) return;
        setCheckedFor(`${name}@${version}`);
        runCheck({ datapackName: name, version });
    }, [runCheck, name, version]);
    // Asked, not posted, so the button can show it is working until the browser has started: two
    // or three seconds with no response read as a press that did nothing (owner, 2026-10-31). The
    // answer comes once Chrome is launched, before its window shows, so the button also stays busy
    // for Chrome's usual start (`BROWSER_START`). What went wrong, if anything, the handler says
    // itself (a missing URL offers Configure).
    const [opening, setOpening] = useState(false);
    const openAdmin = useCallback((): void => {
        setOpening(true);
        const started = new Promise((resolve) => setTimeout(resolve, FRONTEND_TIMEOUTS.BROWSER_START));
        const answered = webviewClient.request('openAdminPanel', {}).catch(() => undefined);
        void Promise.all([answered, started]).then(() => setOpening(false));
    }, []);
    const show = useCallback((): void => setShowing(true), []);
    const close = useCallback((): void => setShowing(false), []);

    const item = stepFor([check.value, read.value], pack);
    if (!item) return NONE;
    const failure = checkedFor === key ? failureText(check.failure) : undefined;
    return {
        line: <PackSetupStepLine item={item} onShow={show} />,
        dialog: showing ? (
            <PackSetupStepDialog
                item={item}
                checking={check.loading}
                failure={failure}
                onCheck={onCheck}
                openingAdmin={opening}
                onOpenAdmin={openAdmin}
                onClose={close}
            />
        ) : null,
    };
}
