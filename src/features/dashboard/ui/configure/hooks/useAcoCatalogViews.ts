/**
 * The catalog views Configure can offer for the ACO add-on (PL-60), once there is a credential to read
 * them with. Nothing to offer, for whatever reason, leaves the plain field in place: this makes the
 * field easier, and is never the only way to fill it in.
 *
 * @module features/dashboard/ui/configure/hooks/useAcoCatalogViews
 */

import { useEffect, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { AcoCatalogViewChoice } from '@/types/aco';

const NONE: AcoCatalogViewChoice[] = [];

/**
 * @param enabled - whether the project has ACO on and saved
 * @returns the views, empty until they arrive or when there are none to offer
 */
export function useAcoCatalogViews(enabled: boolean): AcoCatalogViewChoice[] {
    const [views, setViews] = useState<AcoCatalogViewChoice[]>(NONE);

    useEffect(() => {
        if (!enabled) return undefined;
        let current = true;
        webviewClient
            .request<{ success?: boolean; data?: { views?: AcoCatalogViewChoice[] } }>('list-aco-catalog-views')
            .then((answer) => {
                if (current) setViews(answer?.data?.views ?? NONE);
            })
            .catch(() => undefined);
        return () => {
            current = false;
        };
    }, [enabled]);

    return views;
}
