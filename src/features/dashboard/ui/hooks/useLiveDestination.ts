/**
 * useLiveDestination Hook
 *
 * Keeps the Integrations header's "project · workspace" crumb current.
 *
 * The init payload seeds it ONCE, so changing the destination left the header
 * naming the OLD target for the rest of the session while every card deployed to
 * the new one (reported live 2026-08-07). The extension pushes the new titles over
 * `projectDestinationUpdate` right after the write — and again if an aborted move
 * points the project back.
 *
 * Deliberately the same shape as {@link useLiveAppBuilderComponents}: seeded prop,
 * re-seeded when the screen hands down a different value, replaced by a push.
 *
 * @module features/dashboard/ui/hooks/useLiveDestination
 */

import { useEffect, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { DestinationTitles, ProjectDestinationUpdatePayload } from '@/types/webviewPayloads';

// DestinationTitles moved to @/types/webviewPayloads — one declaration shared
// with the channel's sender and the integrations init payload. Re-exported
// here for this hook's existing consumers.
export type { DestinationTitles } from '@/types/webviewPayloads';

/**
 * The live deploy destination: the seeded prop until a push replaces it.
 *
 * @param seed - the destination from the init payload
 * @returns the current destination, or undefined when there is none to show
 */
export function useLiveDestination(
    seed: DestinationTitles | undefined,
): DestinationTitles | undefined {
    const [destination, setDestination] = useState<DestinationTitles | undefined>(seed);

    // Re-seed when the screen hands down a different one (reopen / re-init).
    useEffect(() => {
        setDestination(seed);
    }, [seed]);

    useEffect(() => {
        return webviewClient.onMessage('projectDestinationUpdate', (data: unknown) => {
            const payload = data as Partial<ProjectDestinationUpdatePayload>;
            // A malformed push must never blank the header.
            if (payload?.destination) {
                setDestination(payload.destination);
            }
        });
    }, []);

    return destination;
}
