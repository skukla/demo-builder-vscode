/**
 * Storefront setup's step boundaries: where a stopped setup ends (F275).
 *
 * Stop lets the running step finish and starts no further one, as creation does
 * (F274). Before 2026-11-18 setup read its signal before the repository and code steps
 * and before the content, but not before it registered the site and published the code,
 * so a stop during the code step still made the site. The result also says whether the
 * run wrote to a new DA.live site, so the cleanup after a stop knows to remove it.
 *
 * The phases are faked at their module seams: what is under test is the orchestrator's
 * order, not what each phase does.
 */

import './storefrontSetupPhases.sharedMocks';

const mockPhase1 = jest.fn();
jest.mock('@/features/eds/handlers/storefrontSetup/storefrontSetupPhase1', () => ({
    executePhaseGitHubRepo: (...args: unknown[]) => mockPhase1(...args),
}));
const mockPhase2 = jest.fn();
jest.mock('@/features/eds/handlers/storefrontSetup/storefrontSetupPhase2', () => ({
    executePhaseHelixConfig: (...args: unknown[]) => mockPhase2(...args),
}));
const mockPhase3 = jest.fn();
jest.mock('@/features/eds/handlers/storefrontSetup/storefrontSetupPhase3', () => ({
    executePhaseCodeSync: (...args: unknown[]) => mockPhase3(...args),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getDaLiveAuthService: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('mock-token'),
    }),
}));

import {
    createEdsConfig,
    createSetupContext,
    executeStorefrontSetupPhases,
} from './storefrontSetupPhases.testUtils';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { executeEdsPipeline } from '@/features/eds/services/edsPipeline';
import { createMockCommandExecutor } from '../../../../helpers/commandExecutorFake';

const mockPipeline = executeEdsPipeline as jest.Mock;

/** A new repository and a new DA.live site, with content to copy: the agent's usual run. */
const NEW_STOREFRONT = createEdsConfig({
    createdRepo: undefined,
    contentSource: { org: 'co', site: 'cs', indexPath: '/query-index.json' },
});

describe('storefront setup: a stop ends at the next step boundary', () => {
    let stop: AbortController;

    beforeEach(() => {
        jest.clearAllMocks();
        ServiceLocator.setCommandExecutor(createMockCommandExecutor());
        stop = new AbortController();
        mockPhase1.mockResolvedValue(null);
        mockPhase2.mockResolvedValue({ blockCollectionIds: [] });
        mockPhase3.mockResolvedValue(null);
    });

    it('stopped during the code step: the site is not registered, nothing after it starts', async () => {
        mockPhase2.mockImplementation(async () => {
            stop.abort(); // the stop arrives while this step runs; the step still finishes
            return { blockCollectionIds: [] };
        });

        const result = await executeStorefrontSetupPhases(
            createSetupContext(),
            NEW_STOREFRONT,
            stop.signal
        );

        expect(mockPhase2).toHaveBeenCalledTimes(1);
        expect(mockPhase3).not.toHaveBeenCalled();
        expect(mockPipeline).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
        expect(result.siteWritten).toBeUndefined();
    });

    it('stopped while the site is registered: the content is not copied, and the site counts as written', async () => {
        mockPhase3.mockImplementation(async () => {
            stop.abort();
            return null;
        });

        const result = await executeStorefrontSetupPhases(
            createSetupContext(),
            NEW_STOREFRONT,
            stop.signal
        );

        expect(mockPipeline).not.toHaveBeenCalled();
        expect(result).toMatchObject({ success: false, siteWritten: true });
    });

    it('stopped before it starts: not even the repository step runs', async () => {
        stop.abort();

        const result = await executeStorefrontSetupPhases(
            createSetupContext(),
            NEW_STOREFRONT,
            stop.signal
        );

        expect(mockPhase1).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
    });

    it("never counts a site it was handed as written: an existing site is not this run's to remove", async () => {
        mockPhase3.mockImplementation(async () => {
            stop.abort();
            return null;
        });

        const result = await executeStorefrontSetupPhases(
            createSetupContext(),
            { ...NEW_STOREFRONT, selectedSite: { id: 'test-site', name: 'test-site' } },
            stop.signal
        );

        expect(result.siteWritten).toBeUndefined();
    });
});
