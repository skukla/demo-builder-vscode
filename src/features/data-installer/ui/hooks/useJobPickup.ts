/**
 * Read an accepted job's status as soon as it is accepted, and say whether its first answer is
 * still to come, so the window keeps waiting instead of falling back to what came before the start.
 *
 * @module features/data-installer/ui/hooks/useJobPickup
 */

import { useEffect, useRef } from 'react';

/**
 * The job was accepted and its first status read has not answered. Having nothing to show yet is
 * still a wait: a window that fell through here showed what came before the start, mid-removal. A
 * read that answers with no record lets go, so the window cannot hang on a wait.
 */
export function isPickingUp(
    activation: string | undefined,
    record: { activationId?: string } | null,
    askedAbout: string | undefined,
    reading: boolean,
): boolean {
    if (!activation || record?.activationId === activation) return false;
    return askedAbout !== activation || reading;
}

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
