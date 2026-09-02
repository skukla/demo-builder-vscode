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

import { getLogger } from '@/core/logging/debugLogger';
import { StepLogger } from '@/core/logging/stepLogger';
const MESH = 'GraphQLServiceSDK';
const MGMT = 'AdobeIOManagementAPISDK';

export { StepLogger, getLogger };

export {
    MESH,
    MGMT,
};

import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { Logger } from '@/types/logger';
// Automocked so a spec can drive it; the harness gives it the real behaviour.
jest.mock('@/types/typeGuards');
import { parseJSON } from '@/types/typeGuards';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { AdobeEntityFetcher } from '@/features/authentication/services/adobeEntityFetcher';

export { AdobeEntityFetcher, parseJSON };

export interface EntityFetcherHarness {
    fetcher: AdobeEntityFetcher;
    mockCommandExecutor: jest.Mocked<CommandExecutor>;
    mockSDKClient: jest.Mocked<AdobeSDKClient>;
    mockCacheManager: jest.Mocked<AuthCacheManager>;
    mockLogger: jest.Mocked<Logger>;
    mockStepLogger: jest.Mocked<StepLogger>;
    onNoOrgsAccessible: jest.Mock;
}

/**
 * The fetcher with every collaborator stubbed to its quiet default: no SDK, an
 * empty cache, and a `parseJSON` that behaves like the real one.
 *
 * 46 lines, identical in two suites down to a trailing comma. The SDK reports
 * NOT initialised on purpose — the fetcher is SDK-first with a CLI fallback, so
 * this default sends every test down the fallback unless it says otherwise.
 */
export function setupEntityFetcher(): EntityFetcherHarness {
    (getLogger as jest.Mock).mockReturnValue(createMockLogger());

    (parseJSON as jest.Mock).mockImplementation((str: string) => {
        try {
            return JSON.parse(str);
        } catch {
            return null;
        }
    });

    const mockCommandExecutor = createMockCommandExecutor({ execute: jest.fn() });

    const mockSDKClient = {
        isInitialized: jest.fn().mockReturnValue(false),
        getClient: jest.fn(),
        ensureInitialized: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<AdobeSDKClient>;

    const mockCacheManager = {
        getCachedOrgList: jest.fn().mockReturnValue(undefined),
        setCachedOrgList: jest.fn(),
        getCachedOrganization: jest.fn().mockReturnValue(undefined),
        getCachedProject: jest.fn().mockReturnValue(undefined),
    } as unknown as jest.Mocked<AuthCacheManager>;

    const mockLogger = createMockLogger() as unknown as jest.Mocked<Logger>;

    const mockStepLogger = {
        logTemplate: jest.fn(),
    } as unknown as jest.Mocked<StepLogger>;

    const onNoOrgsAccessible = jest.fn();

    const fetcher = new AdobeEntityFetcher(
        mockCommandExecutor,
        mockSDKClient,
        mockCacheManager,
        mockLogger,
        mockStepLogger,
        { onNoOrgsAccessible }
    );

    return {
        fetcher,
        mockCommandExecutor,
        mockSDKClient,
        mockCacheManager,
        mockLogger,
        mockStepLogger,
        onNoOrgsAccessible,
    };
}
