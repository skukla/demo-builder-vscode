/**
 * "Simulate downtime" on the mock ERP's card (AB-59): the ERP answers every call as a real ERP
 * does while it is down for maintenance, so the demo can show orders waiting and going through
 * once it is back. It comes back by itself when the time is up; while it is down, the modal
 * offers to end it now instead. A demo control, not an ERP setting: it left the ERP's own
 * Settings screen (owner, 2026-10-02).
 *
 * The core `Modal`, with its wait while the ERP is read and a Spectrum `NumberField` for the
 * minutes. A read or a control that did not go through is the title's outcome, in red, with the
 * ERP's words under it. Hosts its own DialogContainer, the house rule for a modal
 * (tests/sop/modal-hosting.test.ts).
 *
 * @module features/dashboard/ui/components/ErpDowntimeDialog
 */

import { DialogContainer, NumberField } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { Modal, type ActionButton, type ModalWait } from '@/core/ui/components/ui/Modal';
import {
    useErpDemoControls,
    type ErpDemoControlTarget,
    type ErpDemoState,
} from '@/features/dashboard/ui/hooks/useErpDemoControls';
import { ERP_DOWNTIME_MINUTES } from '@/types/erpDemoControls';

export type { ErpDemoControlTarget };

const { min: MIN, max: MAX } = ERP_DOWNTIME_MINUTES;

/** A dialog reading what it will show says nothing while it does. */
const READING: ModalWait = {};

function isWindowLength(minutes: number): boolean {
    return Number.isInteger(minutes) && minutes >= MIN && minutes <= MAX;
}

/**
 * Host the downtime modal while it is open on an ERP.
 *
 * @param props - the ERP it is open on (or none) and the close callback
 * @returns the dialog container
 */
export function ErpDowntimeDialog({ target, onClose }: {
    target: ErpDemoControlTarget | null;
    onClose: () => void;
}): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {target && <DowntimeModal target={target} onClose={onClose} />}
        </DialogContainer>
    );
}

/** The title: the question it is open on, or what did not go through. */
function titleOf(name: string, state: ErpDemoState | null, error: string | null): string {
    if (!error) return `${name}: Simulate Downtime`;
    if (!state) return `Couldn't Read ${name}`;
    return state.maintenance ? `Couldn't End Downtime on ${name}` : `Couldn't Start Downtime on ${name}`;
}

/** How long, and start; or, while the ERP is down, end it. Mounted per opening. */
function DowntimeModal({ target, onClose }: {
    target: ErpDemoControlTarget;
    onClose: () => void;
}): React.ReactElement {
    const { state, error, busy, run } = useErpDemoControls(target);
    const [minutes, setMinutes] = useState<number>(ERP_DOWNTIME_MINUTES.default);
    const running = state?.maintenance ?? null;

    const action: ActionButton = running
        ? {
            label: 'End Downtime',
            variant: 'accent',
            onPress: () => {
                void run('endErpDowntime', {});
            },
            isDisabled: busy,
        }
        : {
            label: 'Start Downtime',
            variant: 'accent',
            onPress: () => {
                void run('startErpDowntime', { minutes });
            },
            isDisabled: busy || !state || !isWindowLength(minutes),
        };

    return (
        <Modal
            title={titleOf(target.name, state, error)}
            status={error ? 'error' : undefined}
            size="S"
            fitContent
            onClose={onClose}
            actionButtons={state ? [action] : []}
            waiting={!state && busy ? READING : false}
        >
            <div className="dialog-stack">
                {error && <p className="dialog-line">{error}</p>}
                {running && <p className="dialog-line">{running.message}</p>}
                {state && !running && (
                    <>
                        <p className="dialog-line">
                            {target.name} answers every call as down for maintenance until the time
                            is up, so orders wait and go through once it is back.
                        </p>
                        <NumberField
                            label="Minutes"
                            value={minutes}
                            onChange={setMinutes}
                            minValue={MIN}
                            maxValue={MAX}
                            step={1}
                            width="size-1600"
                        />
                    </>
                )}
            </div>
        </Modal>
    );
}
