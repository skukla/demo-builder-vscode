/**
 * Shared setup for the commerceStoreDiscovery suites.
 *
 * There is deliberately almost nothing here. Both suites used to open with the
 * same `jest.mock('@/core/utils/timeoutConfig', …)` wall; deleting it and
 * re-running showed it was DEAD — timeoutConfig is a plain constant object with
 * no VS Code or filesystem dependency, so the real one loads and the only value
 * either suite reads (`TIMEOUTS.NORMAL`, handed to `AbortSignal.timeout`) is
 * never asserted. What the family actually shares is the subject and the fetch
 * spy, so that is what this file owns.
 */

import {
    discoverStoreStructure,
    fetchStoreStructurePaas,
    getAdminToken,
} from '@/features/eds/services/commerceStoreDiscovery';
import type { StoreDiscoveryParams } from '@/types/commerceStore';

export { discoverStoreStructure, fetchStoreStructurePaas, getAdminToken };

/** Spy on global fetch. Restore it in the suite's own `afterEach`. */
export const spyOnFetch = (): jest.SpyInstance => jest.spyOn(globalThis, 'fetch');

/** The error a failed discovery reported, or a marker if it unexpectedly worked. */
export async function errorFromDiscovery(params: StoreDiscoveryParams): Promise<string> {
    const result = await discoverStoreStructure(params);
    return result.success ? '<succeeded unexpectedly>' : result.error;
}
