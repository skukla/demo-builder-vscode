/**
 * useLiveDaLiveUrl — the live DA.live authoring URL for the dashboard session.
 *
 * Extracted from ProjectDashboardScreen (decompose pass after ADR-011 D3).
 * The DA.live URL is LIVE: a Configure save can flip the authoring experience
 * while the dashboard is open, so it's state (seeded from the open-time prop)
 * updated by the `authoringExperienceUpdate` message the Configure save
 * handler pushes. Mirrors the meshStatusUpdate subscription pattern: onMessage
 * returns an unsubscribe fn used for cleanup. Only ever moves the value to a
 * new DEFINED value (never clears it), preserving the prop seed.
 *
 * @module features/dashboard/ui/hooks/useLiveDaLiveUrl
 */

import { useEffect, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/**
 * The live DA.live authoring URL, seeded from the open-time prop and kept
 * fresh by Configure-save pushes.
 *
 * @param initial - the open-time `edsDaLiveUrl` prop
 * @returns the current authoring URL (undefined when the project has none)
 */
export function useLiveDaLiveUrl(initial: string | undefined): string | undefined {
    const [url, setUrl] = useState(initial);

    useEffect(() => {
        const unsubscribe = webviewClient.onMessage(
            'authoringExperienceUpdate',
            (data: unknown) => {
                const payload = data as { edsDaLiveUrl?: string };
                if (payload.edsDaLiveUrl) {
                    setUrl(payload.edsDaLiveUrl);
                }
            },
        );
        return unsubscribe;
    }, []);

    return url;
}
