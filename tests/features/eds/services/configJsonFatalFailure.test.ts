/**
 * A failed config.json sync must STOP project creation.
 *
 * WHY IT MATTERS. The storefront is already live by the time this runs. If
 * config.json never reaches GitHub, the site serves but every Commerce feature
 * on it is dead — a half-built demo that looks finished. So the failure has to
 * be loud and fatal rather than logged and stepped over.
 *
 * WHAT THIS FILE USED TO BE, because the replacement is the point. It was 206
 * lines that imported NOTHING. Every test declared an inline function
 * reproducing what the code was believed to do, ran it, and asserted on its own
 * reproduction — including a pair named "old behavior (BAD)" and "new behavior
 * (GOOD)" that compared two simulations to each other. It could not fail if
 * production changed, because production was never on the stack.
 *
 * That mattered here more than usual: the fatal throw it described lives at
 * `executorEdsPhase.ts:216`, and nothing else in the suite asserted it. The
 * behaviour was, in practice, untested — while a green 206-line file sat next to
 * it looking like coverage. The simulation had also drifted: it asserted the
 * SERVICE throws, and `syncConfigToRemote` does not. It returns a result with
 * `error` set, and the CALLER decides that is fatal.
 *
 * These tests drive the real `syncEdsConfigToRemote` and assert on what it does.
 */

const mockSyncConfigToRemote = jest.fn();
const mockExistsSync = jest.fn((_p: string) => true);
const mockReadFileSync = jest.fn((_p: string, _enc?: string) => '{}');

jest.mock('@/features/eds/services/configSyncService', () => ({
    syncConfigToRemote: (...args: unknown[]) => mockSyncConfigToRemote(...args),
}));

jest.mock('fs', () => ({
    existsSync: (p: string) => mockExistsSync(p),
    readFileSync: (p: string, enc: string) => mockReadFileSync(p, enc),
}));

jest.mock('@/features/eds/services/storefront/storefrontStalenessDetector', () => ({
    updateStorefrontState: jest.fn(),
}));

import { syncEdsConfigToRemote } from '@/features/project-creation/handlers/executorEdsPhase';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import type { HandlerContext } from '@/types/handlers';
import type { ProjectCreationConfig } from '@/types/webviewRequests';

const EDS_PATH = '/projects/demo/components/eds-storefront';

/** The shape Phase 5 needs to get past its skip guards and actually sync. */
function readyConfig(): ProjectCreationConfig {
    return {
        edsConfig: {
            preflightComplete: true,
            repoUrl: 'https://github.com/acme/demo-storefront',
        },
    } as unknown as ProjectCreationConfig;
}

function runPhase5(context: HandlerContext, config = readyConfig()) {
    return syncEdsConfigToRemote(context, createMockProject(), config, true, EDS_PATH, jest.fn());
}

beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{}');
});

describe('a failed config.json sync stops project creation', () => {
    it('THROWS when the sync reports failure — it does not log and continue', async () => {
        mockSyncConfigToRemote.mockResolvedValue({
            success: false,
            error: 'GitHub returned 403',
            githubPushed: false,
        });

        await expect(runPhase5(createMockHandlerContext())).rejects.toThrow(
            /Commerce configuration failed/
        );
    });

    it('says the storefront is LIVE but Commerce is broken — the half-built case', async () => {
        // The specific thing the user has to understand: the site exists and
        // looks fine. An error that only said "sync failed" would read as
        // nothing having happened.
        mockSyncConfigToRemote.mockResolvedValue({
            success: false,
            error: 'GitHub returned 403',
            githubPushed: false,
        });

        await expect(runPhase5(createMockHandlerContext())).rejects.toThrow(
            /storefront is live but Commerce features will not work/i
        );
    });

    it("preserves the service's own reason rather than replacing it", async () => {
        mockSyncConfigToRemote.mockResolvedValue({
            success: false,
            error: 'GitHub returned 403',
            githubPushed: false,
        });

        await expect(runPhase5(createMockHandlerContext())).rejects.toThrow(/GitHub returned 403/);
    });

    it('does NOT throw when the sync succeeds', async () => {
        mockSyncConfigToRemote.mockResolvedValue({
            success: true,
            githubPushed: true,
            cdnPublished: true,
        });

        await expect(runPhase5(createMockHandlerContext())).resolves.toBeUndefined();
    });
});

describe('config.json is validated BEFORE the sync is attempted', () => {
    it('throws when config.json is missing — Phase 4 did not produce it', async () => {
        mockExistsSync.mockReturnValue(false);

        await expect(runPhase5(createMockHandlerContext())).rejects.toThrow(
            /config\.json not found/
        );
        // The point of validating first: no pointless round trip to GitHub.
        expect(mockSyncConfigToRemote).not.toHaveBeenCalled();
    });

    it('throws when config.json is present but not parseable', async () => {
        mockReadFileSync.mockReturnValue('{ not json');

        await expect(runPhase5(createMockHandlerContext())).rejects.toThrow();
        expect(mockSyncConfigToRemote).not.toHaveBeenCalled();
    });
});

describe('the skip conditions — when Phase 5 has no work', () => {
    it('skips a non-EDS stack entirely', async () => {
        const context = createMockHandlerContext();

        await syncEdsConfigToRemote(
            context,
            createMockProject(),
            readyConfig(),
            false,
            EDS_PATH,
            jest.fn()
        );

        expect(mockSyncConfigToRemote).not.toHaveBeenCalled();
    });

    it('skips when EDS preflight never completed', async () => {
        const config = {
            edsConfig: { preflightComplete: false, repoUrl: 'https://github.com/acme/x' },
        } as unknown as ProjectCreationConfig;

        await runPhase5(createMockHandlerContext(), config);

        expect(mockSyncConfigToRemote).not.toHaveBeenCalled();
    });

    it('skips when there is no repo URL to sync to', async () => {
        const config = {
            edsConfig: { preflightComplete: true },
        } as unknown as ProjectCreationConfig;

        await runPhase5(createMockHandlerContext(), config);

        expect(mockSyncConfigToRemote).not.toHaveBeenCalled();
    });
});
