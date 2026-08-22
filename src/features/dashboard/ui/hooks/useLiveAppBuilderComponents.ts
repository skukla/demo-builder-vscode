/**
 * useLiveAppBuilderComponents Hook
 *
 * Keeps the webview's keyed `appBuilderComponents` map current. The init
 * payload seeds it ONCE, so per-id status pushes alone can never land an ADDED
 * entry (no card to flip) nor drop a REMOVED one — the extension therefore
 * pushes the whole fresh persisted map over `appBuilderComponentsSnapshot`
 * after every terminal op (add, deploy, remove, rename). This hook holds that
 * map, re-seeding whenever the screen supplies a new one.
 *
 * Companion to {@link useRowStatusOverrides}: the snapshot carries PERSISTED
 * truth, the override channel carries in-flight status.
 *
 * @module features/dashboard/ui/hooks/useLiveAppBuilderComponents
 */

import { useEffect, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { AppBuilderComponentState } from '@/types/base';
import type { AppBuilderComponentsSnapshotPayload } from '@/types/webviewPayloads';

/** Module-level stable empty map — avoids a new object ref each render. */
const EMPTY_COMPONENTS: Record<string, AppBuilderComponentState> = {};

/**
 * The live keyed component map: the seeded prop until a snapshot push replaces
 * it, and re-seeded whenever the caller supplies a different map.
 *
 * @param seed - The map from the dashboard init/status payload
 * @returns The current keyed component map (never undefined)
 */
export function useLiveAppBuilderComponents(
    seed: Record<string, AppBuilderComponentState> | undefined,
): Record<string, AppBuilderComponentState> {
    const [components, setComponents] = useState<Record<string, AppBuilderComponentState>>(
        seed ?? EMPTY_COMPONENTS,
    );

    // Re-seed when the screen hands down a different map (reopen / re-init).
    useEffect(() => {
        setComponents(seed ?? EMPTY_COMPONENTS);
    }, [seed]);

    useEffect(() => {
        return webviewClient.onMessage('appBuilderComponentsSnapshot', (data: unknown) => {
            const payload = data as Partial<AppBuilderComponentsSnapshotPayload>;
            // A malformed push must never blank the grid.
            if (payload?.components) {
                setComponents(payload.components);
            }
        });
    }, []);

    return components;
}
