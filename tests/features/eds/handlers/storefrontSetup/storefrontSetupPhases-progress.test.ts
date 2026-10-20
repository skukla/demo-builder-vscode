/**
 * Storefront Setup Phases — the progress the content pipeline reports.
 *
 * The pipeline emits operations; this module turns each one into a wizard phase
 * and a number on the 0–100 bar. Two of those numbers are interpolated, and the
 * bar has to stay monotonic across the whole run — a mapping that sends
 * `library-publish` below `content-publish` makes the bar jump backwards in
 * front of a customer.
 *
 * The callback is internal, so it is taken where production takes it: the third
 * argument `executeEdsPipeline` is handed.
 */

import './storefrontSetupPhases.sharedMocks';

jest.setTimeout(5000);

// =============================================================================
// Mocks — before the imports of the module under test
// =============================================================================

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ensureDaLiveAuth: jest.fn(),
    configureDaLivePermissions: jest.fn().mockResolvedValue({ success: true }),
    getDaLiveAuthService: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('mock-token'),
        getUserEmail: jest.fn().mockResolvedValue('test@example.com'),
    }),
}));

jest.mock('@/features/eds/services/github/githubRepoLifecycle', () => ({
    GitHubRepoLifecycle: jest.fn().mockImplementation(() => ({
        createFromTemplate: jest.fn(),
        waitForContent: jest.fn(),
    })),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { QUICK: 5000 },
}));

global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

// =============================================================================
// Imports (after the mocks)
// =============================================================================

import {
    createSetupContext,
    createEdsConfig,
    executeStorefrontSetupPhases,
} from './storefrontSetupPhases.testUtils';
import type { SetupServices } from '@/features/eds/handlers/storefrontSetup/storefrontSetupTypes';
import { executeEdsPipeline } from '@/features/eds/services/edsPipeline';
import type { StorefrontBrokenLink, StorefrontSetupProgressPayload } from '@/types/webviewPayloads';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createMockCommandExecutor } from '../../../../helpers/commandExecutorFake';
import { createMockPipelineResult } from '../../../../helpers/pipelineResultFake';

const mockExecuteEdsPipeline = executeEdsPipeline as jest.MockedFunction<typeof executeEdsPipeline>;

const SERVICES: Partial<SetupServices> = {
    githubAppService: {
        getInstallUrl: () => 'https://github.com/apps/aem-code-sync/installations/select_target',
        isAppInstalled: jest.fn().mockResolvedValue({ isInstalled: true }),
    },
};

type ProgressInfo = {
    operation: string;
    message: string;
    subMessage?: string;
    percentage?: number;
    current?: number;
    total?: number;
};

/**
 * Run one setup, then replay `info` through the progress callback the pipeline
 * was given, and answer with the payload the webview received.
 */
async function reportProgress(info: ProgressInfo) {
    const context = createSetupContext();
    // Cleared per call, not per test: a test that reports twice would otherwise
    // read the FIRST run's callback, which is bound to the first context.
    mockExecuteEdsPipeline.mockClear();
    mockExecuteEdsPipeline.mockResolvedValue(
        createMockPipelineResult({
            contentFilesCopied: 0,
            libraryPaths: [],
        })
    );

    await executeStorefrontSetupPhases(
        context,
        createEdsConfig(),
        new AbortController().signal,
        undefined,
        SERVICES
    );

    const onProgress = mockExecuteEdsPipeline.mock.calls[0]?.[2] as (i: ProgressInfo) => void;
    (context.sendMessage as jest.Mock).mockClear();
    onProgress(info);

    const [, payload] =
        (context.sendMessage as jest.Mock).mock.calls.find(
            ([type]) => type === 'storefront-setup-progress'
        ) ?? [];
    return payload as StorefrontSetupProgressPayload;
}

beforeEach(() => {
    jest.clearAllMocks();
    ServiceLocator.setCommandExecutor(createMockCommandExecutor());
});

// =============================================================================
// Tests
// =============================================================================

describe('every pipeline operation maps to a wizard phase and a bar position', () => {
    // The numbers are pinned, not just their order, because the bar is shared
    // with the phases before and after this one — a value below the previous
    // phase's high-water mark makes the bar run backwards.
    it.each([
        ['content-clear', 'content', 49],
        ['content-copy', 'content', 50],
        ['block-library', 'block-library', 59],
        ['eds-settings', 'block-library', 63],
        ['cache-purge', 'publish', 66],
        ['content-publish', 'publish', 67],
        ['sheet-publish', 'publish', 95],
        ['library-publish', 'publish', 95],
        ['leftover-pages', 'publish', 95],
        ['page-check', 'publish', 95],
        ['catalog-prewarm', 'publish', 95],
    ])('%s → %s at %i', async (operation, phase, progress) => {
        const payload = await reportProgress({ operation, message: 'working' });

        expect(payload.phase).toBe(phase);
        expect(payload.progress).toBe(progress);
    });

    it('publishes the library after the content it belongs to', async () => {
        // library-publish must land above content-publish's end (94), or the
        // bar rewinds between the two.
        const contentEnd = await reportProgress({
            operation: 'content-publish',
            message: 'publishing',
            current: 10,
            total: 10,
        });
        const library = await reportProgress({ operation: 'library-publish', message: 'library' });

        expect(library.progress).toBeGreaterThan(contentEnd.progress as number);
    });

    it('falls back to the content phase for an operation it has never heard of', async () => {
        // It used to push the raw operation string as the phase — a value
        // outside the phase vocabulary that the webview silently ignored.
        const payload = await reportProgress({ operation: 'something-new', message: 'working' });

        expect(payload.phase).toBe('content');
        expect(payload.progress).toBe(50);
    });

    it("puts the pipeline's own words under the step, the step's name said once", async () => {
        const payload = await reportProgress({
            operation: 'content-copy',
            message: 'Copying the content: 40 of 103 files',
            subMessage: '/products/index',
        });

        expect(payload.stage).toBe(OPERATION_STAGES.copyingContent.label);
        expect(payload.message).toBe('40 of 103 files');
    });
});

// Reset runs the same pipeline and names its steps for what an SC recognises; setup
// shows the same step for the same work (progress vocabulary, owner 2026-10-16).
describe("every pipeline operation shows under Reset's step for the same work", () => {
    it.each([
        ['content-clear', OPERATION_STAGES.clearingOldContent.label],
        ['content-copy', OPERATION_STAGES.copyingContent.label],
        ['block-library', OPERATION_STAGES.settingUpAuthoring.label],
        ['eds-settings', OPERATION_STAGES.settingUpAuthoring.label],
        ['cache-purge', OPERATION_STAGES.publishingPages.label],
        ['content-publish', OPERATION_STAGES.publishingPages.label],
        ['sheet-publish', OPERATION_STAGES.publishingPages.label],
        ['library-publish', OPERATION_STAGES.publishingPages.label],
        ['leftover-pages', OPERATION_STAGES.removingOldPages.label],
        ['page-check', OPERATION_STAGES.checkingCopiedPages.label],
        ['catalog-prewarm', OPERATION_STAGES.warmingProductPages.label],
    ])('%s → %s', async (operation, stage) => {
        const payload = await reportProgress({ operation, message: 'working' });

        expect(payload.stage).toBe(stage);
    });

    // The default setup copies no content (no content source): five steps, the
    // authoring setup the fourth.
    it("numbers the step from the run's own list", async () => {
        const payload = await reportProgress({
            operation: 'block-library',
            message: 'Building block library',
        });

        expect(payload.position).toEqual({ index: 4, total: 5 });
        expect(payload.startedAt).toEqual(expect.any(Number));
    });
});

describe('the two interpolated positions', () => {
    it('spreads a content copy across the eight points it owns', async () => {
        // 50 → 58. Half way through the copy is 54, not 4 and not 625.
        const payload = await reportProgress({
            operation: 'content-copy',
            message: 'copying',
            percentage: 50,
        });

        expect(payload.progress).toBe(54);
    });

    it('lands a finished copy at the top of its band', async () => {
        const payload = await reportProgress({
            operation: 'content-copy',
            message: 'copying',
            percentage: 100,
        });

        expect(payload.progress).toBe(58);
    });

    it('leaves the copy at its start when the pipeline reports no percentage', async () => {
        const payload = await reportProgress({ operation: 'content-copy', message: 'copying' });

        expect(payload.progress).toBe(50);
    });

    it('spreads a content publish across the twenty-seven points it owns', async () => {
        // 67 → 94. One third of 30 files is 76.
        const payload = await reportProgress({
            operation: 'content-publish',
            message: 'publishing',
            current: 10,
            total: 30,
        });

        expect(payload.progress).toBe(76);
    });

    it('lands a finished publish at the top of its band', async () => {
        const payload = await reportProgress({
            operation: 'content-publish',
            message: 'publishing',
            current: 30,
            total: 30,
        });

        expect(payload.progress).toBe(94);
    });

    it('leaves the publish at its start when no file count came with it', async () => {
        const payload = await reportProgress({ operation: 'content-publish', message: 'pub' });

        expect(payload.progress).toBe(67);
    });

    it('leaves the publish at its start when the file count has a total but no position', async () => {
        // A pipeline that knows how many files it will publish but has not
        // started yet. Interpolating from an absent `current` puts NaN on the
        // bar, which renders as an empty track.
        const payload = await reportProgress({
            operation: 'content-publish',
            message: 'publishing',
            total: 30,
        });

        expect(payload.progress).toBe(67);
    });

    it('does not divide by a zero total', async () => {
        // A publish of nothing reports total 0; interpolating it would put NaN
        // on the bar, which renders as an empty track.
        const payload = await reportProgress({
            operation: 'content-publish',
            message: 'pub',
            current: 0,
            total: 0,
        });

        expect(payload.progress).toBe(67);
    });

    it('interpolates only for the operation that owns the band', async () => {
        // A percentage riding along with some other operation must not move it.
        const payload = await reportProgress({
            operation: 'cache-purge',
            message: 'purging',
            percentage: 50,
            current: 1,
            total: 2,
        });

        expect(payload.progress).toBe(66);
    });
});

/**
 * What the run hands back once the bar reaches 100.
 *
 * The content copy records links to pages the source lacks too on the patch
 * report it is handed. They are never in the toast: project creation reads them
 * off THIS result and records them, and the Storefront Report lists them. A
 * result that dropped them would leave that report saying nothing is broken.
 */
describe('the result of a finished run', () => {
    it('carries the broken links the content copy recorded', async () => {
        const brokenLinks: StorefrontBrokenLink[] = [{ link: '/fr', pages: ['/footer'] }];
        mockExecuteEdsPipeline.mockImplementation(async (input) => {
            if (!input.patchReport) throw new Error('setup hands the pipeline its patch report');
            input.patchReport.brokenLinks = brokenLinks;
            return createMockPipelineResult({ contentFilesCopied: 0, libraryPaths: [] });
        });

        const result = await executeStorefrontSetupPhases(
            createSetupContext(),
            createEdsConfig(),
            new AbortController().signal,
            undefined,
            SERVICES
        );

        expect(result.success).toBe(true);
        expect(result.brokenLinks).toStrictEqual(brokenLinks);
    });

    it('carries the sentence for what the source has that the storefront does not serve (EDS-40)', async () => {
        const summary = '2 pages the source has are missing from this storefront: /cart, /checkout';
        mockExecuteEdsPipeline.mockResolvedValue(
            createMockPipelineResult({
                contentFilesCopied: 0,
                libraryPaths: [],
                warnings: [summary],
            })
        );

        const result = await executeStorefrontSetupPhases(
            createSetupContext(),
            createEdsConfig(),
            new AbortController().signal,
            undefined,
            SERVICES
        );

        expect(result.success).toBe(true);
        expect(result.pipelineWarnings).toEqual([summary]);
    });

    it('carries no such sentence when the storefront serves them all', async () => {
        mockExecuteEdsPipeline.mockResolvedValue(
            createMockPipelineResult({
                contentFilesCopied: 0,
                libraryPaths: [],
            })
        );

        const result = await executeStorefrontSetupPhases(
            createSetupContext(),
            createEdsConfig(),
            new AbortController().signal,
            undefined,
            SERVICES
        );

        expect(result).not.toHaveProperty('pipelineWarnings');
    });
});
