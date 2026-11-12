/**
 * "Simulate downtime" on the mock ERP's card (AB-59): the ERP answers every call as a real ERP
 * does while it is down for maintenance, so the demo can show orders waiting and going through
 * once it is back. It comes back by itself when the time is up; while it is down, the modal
 * offers to end it now instead. A demo control, not an ERP setting: it left the ERP's own
 * Settings screen (owner, 2026-10-02).
 *
 * The Form layout (`FormDialog`, Phase 1b), with its wait while the ERP is read and a Spectrum
 * `NumberField` for the minutes. A read or a control that did not go through is the title's
 * outcome, in red, with the ERP's words on the failure line, whose room is kept from the start.
 *
 * @module features/dashboard/ui/components/ErpDowntimeDialog
 */

import { NumberField } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { FormDialog } from '@/core/ui/components/ui/FormDialog';
import type { ModalWait } from '@/core/ui/components/ui/Modal';
import { ResultDialog } from '@/core/ui/components/ui/ResultDialog';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import {
    useErpDemoControls,
    type ErpDemoControlTarget,
    type ErpDemoState,
} from '@/features/dashboard/ui/hooks/useErpDemoControls';
import { ERP_DOWNTIME_MINUTES } from '@/types/erpDemoControls';

export type { ErpDemoControlTarget };

const { min: MIN, max: MAX } = ERP_DOWNTIME_MINUTES;

/** A dialog reading what it will show says nothing while it does. */
const READING: ModalWait = WAIT_STAGES.readingErpStatus;

function isWindowLength(minutes: number): boolean {
    return Number.isInteger(minutes) && minutes >= MIN && minutes <= MAX;
}

/**
 * Host the downtime form while it is open on an ERP.
 *
 * @param props - the ERP it is open on (or none) and the close callback
 * @returns the form, closed when no ERP is chosen
 */
export function ErpDowntimeDialog({ target, onClose }: {
    target: ErpDemoControlTarget | null;
    onClose: () => void;
}): React.ReactElement | null {
    return target ? <DowntimeForm target={target} onClose={onClose} /> : null;
}

/** The title: the question it is open on, or what did not go through. */
function titleOf(name: string, state: ErpDemoState | null, error: string | null): string {
    if (!error) return `${name}: Simulate Downtime`;
    if (!state) return `Couldn't Read ${name}`;
    return state.maintenance ? `Couldn't End Downtime on ${name}` : `Couldn't Start Downtime on ${name}`;
}

/** How long, and start; or, while the ERP is down, end it. Mounted per opening. */
function DowntimeForm({ target, onClose }: {
    target: ErpDemoControlTarget;
    onClose: () => void;
}): React.ReactElement {
    const { state, error, busy, run } = useErpDemoControls(target);
    const [minutes, setMinutes] = useState<number>(ERP_DOWNTIME_MINUTES.default);
    const running = state?.maintenance ?? null;
    const lead = running
        ? running.message
        : `${target.name} answers every call as down for maintenance until the time is up, so orders wait and go through once it is back.`;

    // A read that failed has nothing to fill in: the result, with the ERP's words and Close (rule 17).
    if (!state && error) {
        return (
            <ResultDialog isOpen title={titleOf(target.name, state, error)} status="error" onClose={onClose}>
                {error}
            </ResultDialog>
        );
    }
    return (
        <FormDialog
            isOpen
            title={titleOf(target.name, state, error)}
            {...(state ? { lead } : {})}
            submitLabel={running ? 'End Downtime' : 'Start Downtime'}
            onSubmit={() => {
                void (running ? run('endErpDowntime', {}) : run('startErpDowntime', { minutes }));
            }}
            submitDisabled={busy || !state || (!running && !isWindowLength(minutes))}
            failure={error}
            waiting={!state && busy ? READING : false}
            onClose={onClose}
        >
            {state && !running ? (
                <NumberField
                    label="Minutes"
                    value={minutes}
                    onChange={setMinutes}
                    minValue={MIN}
                    maxValue={MAX}
                    step={1}
                    width="size-1600"
                />
            ) : null}
        </FormDialog>
    );
}
