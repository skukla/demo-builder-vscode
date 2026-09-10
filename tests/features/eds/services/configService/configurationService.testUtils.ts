/**
 * Shared setup for the two ConfigurationService suites.
 *
 * Both open with the same fourteen lines: the timeout mock, a logger, a token
 * provider, and the IMS token they hand it. Both then spy on `global.fetch` in
 * `beforeEach` and restore it in `afterEach` — the same nine lines again.
 *
 * The suites import the service FROM HERE. `jest.mock` hoists above the imports
 * of the module it appears in, so a suite importing the service itself could
 * bind it before the timeout mock was registered.
 */

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
    },
}));

import { createMockLogger } from '../../../../helpers/loggerFake';

export const mockLogger = createMockLogger();

export const mockTokenProvider = {
    getAccessToken: jest.fn(),
};

/** A structurally valid IMS token. Not a credential — the payload is the word "mock". */
export const MOCK_IMS_TOKEN =
    'eyJhbGciOiJSUzI1NiIsIng1dSI6Imltc19uYTEta2V5LWF0LTEuY2VyIn0.mock-ims-token';

/**
 * Swap `global.fetch` for a spy that answers 200. Returned so a test can give it
 * a different response; pair with `.mockRestore()` in `afterEach`.
 */
export function spyOnFetch(): jest.SpyInstance {
    return jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
}

// Below the mock on purpose — see the note above about hoisting.
export {
    ConfigurationService,
    buildSiteConfigParams,
} from '@/features/eds/services/configService/configurationService';
export type { SiteRegistrationParams } from '@/features/eds/services/configService/configurationService';
