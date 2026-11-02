/**
 * Read an accepted job's status as soon as it is accepted, and say whether its first answer is
 * still to come, so the dialog can keep waiting instead of falling back to its form.
 *
 * @module features/data-installer/ui/hooks/useJobPickup
 */

import { useEffect, useRef } from 'react';
import { isPickingUp } from '../components/importModalView';

export function useJobPickup(
    activation: string | undefined,
    record: { activationId?: string } | null,
    reading: boolean,
    readStatus: (body: Record<string, never>) => void,
): boolean {
    const askedAbout = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (activation) {
            askedAbout.current = activation;
            readStatus({});
        }
    }, [activation, readStatus]);
    return isPickingUp(activation, record, askedAbout.current, reading);
}
