/**
 * useRowStatusOverrides Hook
 *
 * Subscribe to the per-id `appBuilderComponentStatusUpdate` channel and merge
 * each update into an id-keyed override map, so a deploy flips ONLY its own
 * card (deploying spinner → deployed/error) without re-seeding the whole grid.
 * A rename rides the same channel with the entry's current status plus the new
 * `name`, refreshing the card label (the init-seeded map never re-delivers).
 *
 * Moved out of the retired AppBuilderComponentsList (integrations grid Step 7)
 * unchanged; the {@link RowStatusOverride} shape now has its durable home on
 * the card model.
 *
 * @module features/dashboard/ui/hooks/useRowStatusOverrides
 */

import { useEffect, useState } from 'react';
import type { RowStatusOverride } from '../components/integrations/integrationCardModel';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

/**
 * Live per-id status overrides from the `appBuilderComponentStatusUpdate` push
 * channel.
 *
 * @returns id-keyed override map (empty until the first push)
 */
export function useRowStatusOverrides(): Record<string, RowStatusOverride> {
    const [overrides, setOverrides] = useState<Record<string, RowStatusOverride>>({});

    useEffect(() => {
        return webviewClient.onMessage('appBuilderComponentStatusUpdate', (data: unknown) => {
            const payload = data as {
                id?: string;
                status?: string;
                message?: string;
                name?: string;
            };
            if (!payload?.id || !payload?.status) {
                return;
            }
            const { id, status, message, name } = payload;
            // Merge, don't replace: deploy pushes omit `name`, and a wholesale
            // replace would wipe a prior rename's update-borne label.
            setOverrides((prev) => ({
                ...prev,
                [id]: { status, message, name: name ?? prev[id]?.name },
            }));
        });
    }, []);

    return overrides;
}
