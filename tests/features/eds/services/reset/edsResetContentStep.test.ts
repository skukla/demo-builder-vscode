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

import type { PatchReport } from '@/features/eds/services/patches/patchReportHelper';
import type { Project } from '@/types/base';
import { createMockProject, edsStorefrontInstance } from '../../../../helpers/projectFake';

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
        return { success: true, contentFilesCopied: 3, libraryPaths: [] };
    });
});

describe('runContentPipeline - the broken-links record', () => {
    it('replaces the record with what the fresh copy found', async () => {
        const project = storefrontProject();

        await runReset({ project, contentSource: CONTENT_SOURCE });

        expect(brokenLinks(project)).toStrictEqual(NEW_LINKS);
    });

    it('keeps the last record when the SC kept the current content', async () => {
        const project = storefrontProject();

        await runReset({ project, contentSource: CONTENT_SOURCE, keepContent: true });

        expect(brokenLinks(project)).toStrictEqual(OLD_LINKS);
    });

    it('keeps the last record when the storefront has no content source to copy', async () => {
        const project = storefrontProject();

        await runReset({ project });

        expect(brokenLinks(project)).toStrictEqual(OLD_LINKS);
    });
});
