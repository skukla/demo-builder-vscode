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
import type {
    AppBuilderComponentStatusUpdatePayload,
    AppBuilderComponentsSnapshotPayload,
} from '@/types/webviewPayloads';

/**
 * Live per-id status overrides from the `appBuilderComponentStatusUpdate` push
 * channel.
 *
 * Overrides are PRUNED against each `appBuilderComponentsSnapshot`: an override
 * for an id the persisted map no longer holds is dropped. Without that, removing
 * an integration left its `deploying` override behind forever — the entry left
 * the map, but `buildIntegrationCards` synthesizes a pending card for any
 * unknown-id `deploying` override, so the grid showed a GHOST card stuck on
 * "Deploying…" (reported 2026-07-31). Pruning on the snapshot rather than on the
 * remove handler means it self-heals for every cause of disappearance, not just
 * the one that was reported.
 *
 * @returns id-keyed override map (empty until the first push)
 */
export function useRowStatusOverrides(): Record<string, RowStatusOverride> {
    const [overrides, setOverrides] = useState<Record<string, RowStatusOverride>>({});

    useEffect(() => {
        return webviewClient.onMessage('appBuilderComponentsSnapshot', (data: unknown) => {
            // `payload.components`, not the payload itself — the sender wraps the
            // map. Reading it bare made the live id set `['components']`, so every
            // override was pruned on every snapshot. Invisible while the only
            // snapshots followed SUCCESSFUL ops (the persisted status the card fell
            // back to happened to match the override), and fatal on a failure: the
            // error push was wiped and the card read "Deployed" (live 2026-08-08).
            const payload = (data ?? {}) as Partial<AppBuilderComponentsSnapshotPayload>;
            if (!payload.components) {
                return;
            }
            const live = new Set(Object.keys(payload.components));
            setOverrides((prev) => {
                const kept = Object.fromEntries(
                    Object.entries(prev).filter(([id]) => live.has(id)),
                );
                // Same object when nothing was pruned — the map feeds a useMemo
                // dependency, so a fresh identity every snapshot would rebuild
                // every card for nothing.
                return Object.keys(kept).length === Object.keys(prev).length ? prev : kept;
            });
        });
    }, []);

    useEffect(() => {
        return webviewClient.onMessage('appBuilderComponentStatusUpdate', (data: unknown) => {
            const payload = data as Partial<AppBuilderComponentStatusUpdatePayload>;
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
