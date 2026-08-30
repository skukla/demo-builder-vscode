/**
 * Shared setup for the adobeEntityFetcher suites.
 *
 * THIS FILE OWNS THE MOCKS AND EVERY IMPORT THEY REPLACE. Specs import those
 * from HERE and declare no jest.mock of their own — jest.mock hoists above the
 * imports of the module it appears in, NOT across modules, so an import left
 * behind in a spec loads the real module before these mocks register.
 *
 * Extracted 2026-08-30 (lane C1) from byte-identical copies in:
 *   adobeEntityFetcher-apiServices.test.ts
 *   adobeEntityFetcher.orgListSingleFlight.test.ts
 *   adobeEntityFetcher.servicesCache.test.ts
 *   adobeEntityFetcher.teardown.test.ts
 */

import { StepLogger, getLogger } from '@/core/logging';

jest.mock('@/core/logging');
const MESH = 'GraphQLServiceSDK';
const MGMT = 'AdobeIOManagementAPISDK';

export { StepLogger, getLogger };

export {
    MESH,
    MGMT,
};
