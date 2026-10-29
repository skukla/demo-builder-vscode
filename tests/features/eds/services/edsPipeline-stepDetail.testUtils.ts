/**
 * Shared setup for the pipeline's step-detail suites: what each step reports and how it
 * handles its own edges. Split from one suite on 2026-10-20 (EDS-55): the file sat 34 lines
 * under the 750-line limit unformatted and 13 over once prettier ran, so the next edit to
 * it would have failed CI. Every test in both suites used this whole setup, so it is shared
 * here rather than copied (tests/sop/test-family-setup.test.ts).
 *
 * The `edsHelpers` mock lives HERE, above the import of the subject, so it registers before
 * the pipeline loads: a `jest.mock` hoists only within its own module. The suites import
 * nothing from `edsHelpers` themselves, which is what makes moving it safe.
 */

import { createMockLogger } from '../../../helpers/loggerFake';
import {
    basePipelineParams,
    pipelineServices,
    type EdsPipelineParams,
    type EdsPipelineServices,
} from './edsPipeline.testUtils';

export const mockPublishLibraryPaths = jest.fn().mockResolvedValue(undefined);
export const mockPublishSheetPaths = jest.fn();
export const mockVerifyLibraryPreviewed = jest.fn().mockResolvedValue(true);
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    applyDaLiveOrgConfigSettings: jest.fn().mockResolvedValue(undefined),
    publishLibraryPaths: (...args: unknown[]) => mockPublishLibraryPaths(...args),
    publishSheetPaths: (...args: unknown[]) => mockPublishSheetPaths(...args),
    verifyLibraryPreviewed: (...args: unknown[]) => mockVerifyLibraryPreviewed(...args),
}));

export { executeEdsPipeline } from './edsPipeline.testUtils';

/** One progress line the pipeline reported. */
export interface ProgressCall {
    operation: string;
    message: string;
    subMessage?: string;
    current?: number;
    total?: number;
    percentage?: number;
}

export const CONTENT_SOURCE = { org: 'src-org', site: 'src-site', indexPath: '/full-index.json' };

/** The fakes and inputs every step-detail test drives, rebuilt before each test. */
export class StepDetailHarness {
    progress: ProgressCall[] = [];
    readonly onProgress = (info: ProgressCall): void => {
        this.progress.push(info);
    };
    mockCopyContentFromSource = jest.fn();
    mockOverlayAccountChrome = jest.fn();
    mockCreateBlockLibrary = jest.fn();
    mockCopyContent = jest.fn();
    mockReadSiteConfig = jest.fn();
    mockPublishAllSiteContent = jest.fn();
    mockGetFileContent = jest.fn();
    services: EdsPipelineServices = this.buildServices();
    params: EdsPipelineParams = { ...basePipelineParams(), contentSource: CONTENT_SOURCE };

    /** Fresh fakes with their default answers, and an empty progress list. */
    reset(): void {
        jest.clearAllMocks();
        this.progress = [];
        mockVerifyLibraryPreviewed.mockResolvedValue(true);
        this.mockCopyContentFromSource = jest.fn().mockResolvedValue({
            success: true,
            totalFiles: 42,
            copiedFiles: ['/page'],
            failedFiles: [],
            sheetPaths: [],
            codePathsOnSource: [],
        });
        this.mockOverlayAccountChrome = jest
            .fn()
            .mockResolvedValue({ success: true, copiedFiles: [], failedFiles: [], totalFiles: 8 });
        this.mockCreateBlockLibrary = jest
            .fn()
            .mockResolvedValue({ success: true, blocksCount: 5, paths: ['/.da/library/blocks'] });
        this.mockCopyContent = jest.fn().mockResolvedValue({ success: true });
        this.mockReadSiteConfig = jest.fn().mockResolvedValue({ some: 'config' });
        this.mockPublishAllSiteContent = jest.fn().mockResolvedValue(undefined);
        this.mockGetFileContent = jest.fn().mockResolvedValue({ content: '{}', sha: 'abc' });
        this.services = this.buildServices();
        this.params = { ...basePipelineParams(), contentSource: CONTENT_SOURCE };
    }

    /** The first progress line of this operation whose message matches. */
    find(operation: string, match: RegExp): ProgressCall | undefined {
        return this.progress.find((p) => p.operation === operation && match.test(p.message));
    }

    private buildServices(): EdsPipelineServices {
        return pipelineServices({
            daLiveContentOps: {
                copyOps: {
                    copyContentFromSource: this.mockCopyContentFromSource,
                    overlayAccountChrome: this.mockOverlayAccountChrome,
                    copyContent: this.mockCopyContent,
                },
                blockLibOps: {
                    createBlockLibraryFromTemplate: this.mockCreateBlockLibrary,
                },
                configOps: {
                    readSiteConfigForDiagnostics: this.mockReadSiteConfig,
                },
                sourceOps: {
                    deleteAllSiteContent: jest.fn(),
                },
            },
            githubFileOps: { getFileContent: this.mockGetFileContent },
            helixService: {
                purgeCacheAll: jest.fn().mockResolvedValue(undefined),
                publishAllSiteContent: this.mockPublishAllSiteContent,
            } as unknown as EdsPipelineServices['helixService'],
            logger: createMockLogger(),
        });
    }
}

/**
 * The harness for a suite: rebuilt before each of its tests.
 *
 * @returns the harness the tests read their fakes and inputs from
 */
export function stepDetailHarness(): StepDetailHarness {
    const h = new StepDetailHarness();
    beforeEach(() => h.reset());
    return h;
}
