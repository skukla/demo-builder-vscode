/**
 * A fake ACO for the engine's ACO suites: it records each call and accepts it, unless `refuse`
 * answers an error for it. Typed to the real `AcoClient`, so a change to the client's shape fails
 * here at compile time.
 */

import type { AcoClient, AcoIngestionPath } from '@/features/data-installer/services/aco/acoClient';
import type { AcoInstance, AcoStorefrontSettings } from '@/types/aco';

export const ACO_INSTANCE: AcoInstance = { tenantId: 'TenantAbc123', region: 'na1', environment: 'sandbox' };

export const ACO_SETTINGS: AcoStorefrontSettings = {
    ...ACO_INSTANCE,
    catalogViewId: '00000000-0000-4000-8000-000000000001',
    locale: 'en-US',
};

/** One call the fake was sent. */
export interface AcoCall {
    path: AcoIngestionPath;
    rows: readonly unknown[];
}

export function fakeAco(refuse: (call: AcoCall) => Error | undefined = () => undefined): AcoClient & { calls: AcoCall[]; authenticated: number } {
    const calls: AcoCall[] = [];
    const fake = {
        calls,
        authenticated: 0,
        async authenticate() {
            fake.authenticated += 1;
        },
        async post(path: AcoIngestionPath, rows: readonly unknown[]) {
            const call = { path, rows };
            calls.push(call);
            const error = refuse(call);
            if (error) throw error;
            return rows.length;
        },
    };
    return fake;
}
