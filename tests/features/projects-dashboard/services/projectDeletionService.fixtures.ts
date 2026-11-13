/**
 * Fixtures for the projectDeletionService suites — the projects, the handler context,
 * the CDN-unpublish service seam, and the answered delete the batch runs.
 *
 * Separate from `projectDeletionService.testUtils` because that file is the jest.mock
 * WALL and must be imported first; this one is ordinary values built on top of it.
 */

import { runProjectDelete } from './projectDeletionService.testUtils';
import type { DeletionServices } from './projectDeletionService.testUtils';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import type { ImsTokenVerdict } from '@/features/eds/services/daLive/daLiveSignInCheck';
import type { CleanupResultItem } from '@/features/eds/services/resourceCleanupHelpers';
import type { HandlerContext } from '@/types/handlers';
import type { Project } from '@/types/base';

/** A plain, non-EDS project: nothing online to remove. */
export function plainProject(over: Partial<Project> = {}): Project {
    return createMockProject({ name: 'demo-project', path: '/projects/demo', ...over });
}

/**
 * An EDS project: a repository and a DA.live site online.
 *
 * `extractEdsMetadata` keys off `componentInstances`, NOT `componentSelections`
 * (resourceCleanupHelpers.ts). Getting that wrong is silent: the project
 * simply has nothing online and every assertion still passes, which is
 * exactly what the first draft of this file did.
 *
 * The metadata fields are the ones `extractEdsMetadata` reads; without them
 * it returns a null-ish shape and the delete skips the EDS branch again.
 */
export function edsProject(over: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'demo-project',
        path: '/projects/demo',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: {
                    githubRepo: 'skukla/demo-storefront',
                    daLiveOrg: 'skukla',
                    daLiveSite: 'demo-storefront',
                },
            },
        },
        ...over,
    });
}

export function context(): HandlerContext {
    return createMockHandlerContext();
}

/**
 * The CDN-unpublish services, handed in through the seam.
 *
 * There used to be a `jest.mock` here instead, supplying an `unpublishAllContent`
 * the source had stopped calling and NO `initKeyStore` static. The key-store init is
 * the first statement inside the step's try block, so it threw a TypeError, the catch
 * logged it as a warning, and every Helix call below was unreachable — with 23 tests
 * green. Measured 2026-08-31 by planting a throw inside that try: the suite did not
 * notice.
 */
export const mockInitKeyStore = jest.fn();
export const mockListAllPages = jest.fn();
export const mockUnpublishPages = jest.fn();
export const mockDeleteAdminApiKey = jest.fn();
/** What Helix lists as published under /products — where overlay-made pages are found (EDS-26). */
export const mockListPublishedPaths = jest.fn();
/** Removes one file from AEM's copy of the site's code, after the repository is gone (EDS-67). */
export const mockDeleteCode = jest.fn();
/** IMS's verdict on the DA.live sign-in; a storefront's repository is kept unless `valid`. */
export const mockCheckDaLiveSignIn = jest.fn(async (_token: string): Promise<ImsTokenVerdict> => 'valid');
export const SERVICES: DeletionServices = {
    initKeyStore: mockInitKeyStore,
    makeHelix: () => ({
        listAllPages: mockListAllPages,
        unpublishPages: mockUnpublishPages,
        deleteAdminApiKey: mockDeleteAdminApiKey,
        listPublishedPaths: mockListPublishedPaths,
        deleteCode: mockDeleteCode,
    }),
    /** IMS's verdict on the DA.live token before a storefront's repository goes (EDS-67). */
    checkDaLiveSignIn: mockCheckDaLiveSignIn,
};

/** The resources the SC left ticked in the batch's Delete question. */
export type Ticked = Array<'github' | 'daLive' | 'datapackData'>;

/** Every stage the delete reported, as `[stage, position, line under it]`. */
export const mockStageReport = jest.fn();

/** What an answered delete left: why it stopped, if it did, and what each cleanup step did. */
export interface AnsweredDeleteRun {
    stopped?: string;
    cleanupResults: CleanupResultItem[];
}

/**
 * Delete a project as the batch does once its question is answered (`projectsBatch.ts`): the
 * ticked resources as the cleanup options, a given answer for the pack's changes, and a report
 * that records each stage on `mockStageReport`.
 */
export async function deleteAnswered(
    ctx: HandlerContext,
    project: Project,
    services?: DeletionServices,
    ticked: Ticked = ['github', 'daLive'],
): Promise<AnsweredDeleteRun> {
    const cleanupResults: CleanupResultItem[] = [];
    const cleanupOptions = {
        deleteGitHubRepo: ticked.includes('github'),
        deleteDaLiveSite: ticked.includes('daLive'),
        removeDatapackData: ticked.includes('datapackData'),
    };
    const report = (stage: string, step?: string, position?: unknown): void => {
        mockStageReport(stage, position, step);
    };
    const ran = await runProjectDelete(ctx, project, { cleanupOptions, askName: { given: undefined }, cleanupResults, services }, report);
    return { ...ran, cleanupResults };
}
