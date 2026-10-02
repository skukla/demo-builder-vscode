/**
 * "Simulate downtime" on the mock ERP's card (AB-59): the ERP answers every call as a real ERP
 * does while it is down for maintenance, so the demo can show orders waiting and going through
 * once it is back. It comes back by itself when the time is up; while it is down, the modal
 * offers to end it now instead. A demo control, not an ERP setting: it left the ERP's own
 * Settings screen (owner, 2026-10-02).
 *
 * The core `Modal`, `LoadingDisplay` while the ERP is read, a Spectrum `NumberField` for the
 * minutes, and the refusal line `IntegrationSettingsModal` uses. Hosts its own DialogContainer,
 * the house rule for a modal (tests/sop/modal-hosting.test.ts).
 *
 * @module features/dashboard/ui/components/ErpDowntimeDialog
 */

import { DialogContainer, Flex, NumberField, Text } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { Modal, type ActionButton } from '@/core/ui/components/ui/Modal';
import {
    useErpDemoControls,
    type ErpDemoControlTarget,
} from '@/features/dashboard/ui/hooks/useErpDemoControls';
import { ERP_DOWNTIME_MINUTES } from '@/types/erpDemoControls';

const { min: MIN, max: MAX } = ERP_DOWNTIME_MINUTES;

function isWindowLength(minutes: number): boolean {
    return Number.isInteger(minutes) && minutes >= MIN && minutes <= MAX;
}

/**
 * Host the downtime modal while the open control is the ERP's simulated downtime.
 *
 * @param props - the open control (or none) and the close callback
 * @returns the dialog container
 */
export function ErpDowntimeDialog({ target, onClose }: {
    target: ErpDemoControlTarget | null;
    onClose: () => void;
}): React.ReactElement {
    return (
        <DialogContainer onDismiss={onClose}>
            {target?.control === 'downtime' && <DowntimeModal target={target} onClose={onClose} />}
        </DialogContainer>
    );
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
            label: 'End downtime',
            variant: 'accent',
            onPress: () => {
                void run('endErpDowntime', {});
            },
            isDisabled: busy,
        }
        : {
            label: 'Start downtime',
            variant: 'accent',
            onPress: () => {
                void run('startErpDowntime', { minutes });
            },
            isDisabled: busy || !state || !isWindowLength(minutes),
        };

    return (
        <Modal
            title={`${target.name}: simulate downtime`}
            size="S"
            fitContent
            onClose={onClose}
            actionButtons={[action]}
        >
            <Flex direction="column" gap="size-200">
                <Text>
                    A demo control: {target.name} answers every call as a real ERP does while it
                    is down for maintenance, so orders wait and go through once it is back. It
                    comes back by itself when the time is up.
                </Text>
                {!state && busy && <LoadingDisplay size="S" message={`Reading ${target.name}`} />}
                {running && <Text>{running.message}</Text>}
                {running && <Text>End it now to bring {target.name} back.</Text>}
                {state && !running && (
                    <NumberField
                        label="Minutes"
                        value={minutes}
                        onChange={setMinutes}
                        minValue={MIN}
                        maxValue={MAX}
                        step={1}
                        width="size-1600"
                    />
                )}
                {error && <Text UNSAFE_className="text-sm text-red-600">{error}</Text>}
            </Flex>
        </Modal>
    );
}
