/**
 * Reset steps 8-11 (`edsResetContentStep`): the broken-links record the content
 * copy leaves on the project.
 *
 * The pipeline's arguments and progress are pinned in
 * `edsResetService-orchestration.test.ts` and its re-auth retry in
 * `edsResetContentStep-daLiveReauth.test.ts`. What neither constrained, found by
 * the first mutation run of this module on its own (EDS-8, 2026-10-08): the
 * record is replaced only when content was copied afresh, so a kept-content reset
 * and a reset with no content source both leave the last record standing.
 */

import {
    mockExecuteEdsPipeline,
    resetOrchestrationMocks,
    runReset,
} from './edsResetService.orchestrationHarness';
import { brokenLinksSentence } from '@/features/eds/services/storefront/brokenLinksRecord';

const mockPublishAuthoredListStep = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/eds/services/catalogMenu/catalogMenuStep', () => ({
    ...jest.requireActual('@/features/eds/services/catalogMenu/catalogMenuStep'),
    publishAuthoredListStep: (...a: unknown[]) => mockPublishAuthoredListStep(...a),
}));

import type { PatchReport } from '@/features/eds/services/patches/patchReportHelper';
import type { Project } from '@/types/base';
import { createMockProject, edsStorefrontInstance } from '../../../../helpers/projectFake';
import { createMockPipelineResult } from '../../../../helpers/pipelineResultFake';

jest.setTimeout(5000);

const OLD_LINKS = [{ link: '/old', pages: ['/index'] }];
const NEW_LINKS = [{ link: '/new', pages: ['/about'] }];
const CONTENT_SOURCE = { org: 'jen', site: 'isle5-content' };

function storefrontProject(): Project {
    return createMockProject({
        selectedPackage: 'citisignal',
        selectedStack: 'eds-paas',
        componentInstances: {
            'eds-storefront': { ...edsStorefrontInstance(), metadata: { brokenLinks: OLD_LINKS } },
        },
    });
}

function brokenLinks(project: Project): unknown {
    return project.componentInstances?.['eds-storefront']?.metadata?.brokenLinks;
}

beforeEach(() => {
    resetOrchestrationMocks();
    // The pipeline reports the links its copy found broken on the report it was handed.
    mockExecuteEdsPipeline.mockImplementation(async (options: { patchReport: PatchReport }) => {
        options.patchReport.brokenLinks = NEW_LINKS.map((l) => ({ ...l, pages: [...l.pages] }));
        return createMockPipelineResult({ contentFilesCopied: 3, libraryPaths: [] });
    });
});

describe('runContentPipeline - the broken-links record', () => {
    it('replaces the record with what the fresh copy found, and names them in the result', async () => {
        const project = storefrontProject();

        const { result } = await runReset({ project, contentSource: CONTENT_SOURCE });

        expect(brokenLinks(project)).toStrictEqual(NEW_LINKS);
        expect(result.brokenLinks).toBe(brokenLinksSentence(NEW_LINKS));
    });

    it('keeps the last record when the SC kept the current content, and says nothing of it', async () => {
        const project = storefrontProject();

        const { result } = await runReset({ project, contentSource: CONTENT_SOURCE, keepContent: true });

        expect(brokenLinks(project)).toStrictEqual(OLD_LINKS);
        expect(result).not.toHaveProperty('brokenLinks');
    });

    it('keeps the last record when the storefront has no content source to copy', async () => {
        const project = storefrontProject();

        await runReset({ project });

        expect(brokenLinks(project)).toStrictEqual(OLD_LINKS);
    });
});

/**
 * EDS-61: reset takes the authored-pages sheet out before it re-publishes the content. When
 * that take-out failed, the old sheet is still live during the bulk publish, so the pipeline's
 * hook refreshes it first — only where the record says it is live (the failed take-out kept
 * that flag). The take-out's own sentence already reports the failure.
 */
describe('runContentPipeline - the authored-pages sheet before the bulk publish', () => {
    it('hands the pipeline a hook that refreshes a sheet still live, on this storefront', async () => {
        const project = storefrontProject();

        await runReset({ project, contentSource: CONTENT_SOURCE });
        await mockExecuteEdsPipeline.mock.calls[0][0].beforeContentPublish?.();

        expect(mockPublishAuthoredListStep).toHaveBeenCalledTimes(1);
        const [passed, site, options] = mockPublishAuthoredListStep.mock.calls[0];
        expect(passed).toBe(project);
        expect(typeof site.categoryPages.publishAuthoredSheet).toBe('function');
        expect(options).toEqual({ onlyWhenPublished: true });
    });
});

