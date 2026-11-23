/**
 * The storefront's content copy during creation. It used to end on a log line when it
 * failed, so the run said "Project Created" over a storefront with no pages. It now
 * hands the run its failure, and the run pauses on it (F307).
 */

jest.mock('@/features/project-creation/services/edsContentSetup', () => ({
    ensureEdsContent: jest.fn(),
}));

import { setupEdsContent } from '@/features/project-creation/handlers/executorEdsPhase';
import { ensureEdsContent } from '@/features/project-creation/services/edsContentSetup';
import type { ProjectCreationConfig } from '@/types/webviewRequests';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const EDS: ProjectCreationConfig = {
    projectName: 'content-demo',
    edsConfig: {
        repoUrl: 'https://github.com/acme/content-demo',
        daLiveOrg: 'acme',
        daLiveSite: 'content-demo',
        contentSource: { org: 'adobe', site: 'citisignal' },
        templateRepo: 'boilerplate',
    },
} as ProjectCreationConfig;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('setupEdsContent', () => {
    it('hands the run a plain failure when the copy fails', async () => {
        (ensureEdsContent as jest.Mock).mockRejectedValueOnce(new Error('DA.live 401'));

        const failure = await setupEdsContent(createMockHandlerContext(), EDS, true, jest.fn());

        expect(failure?.reason).toBe(
            "The storefront's pages could not be copied. Check that DA.live and GitHub are signed in, then try again.",
        );
    });

    it('passes when the copy succeeds', async () => {
        (ensureEdsContent as jest.Mock).mockResolvedValueOnce(false);

        await expect(setupEdsContent(createMockHandlerContext(), EDS, true, jest.fn())).resolves.toBeUndefined();
        expect(ensureEdsContent).toHaveBeenCalledTimes(1);
    });

    it('has nothing to do for a headless storefront', async () => {
        await expect(setupEdsContent(createMockHandlerContext(), EDS, false, jest.fn())).resolves.toBeUndefined();
        expect(ensureEdsContent).not.toHaveBeenCalled();
    });
});
