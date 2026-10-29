/**
 * `deleteCode` — removing ONE file from AEM's copy of a site's code (EDS-67).
 *
 * AEM keeps its own copy of a storefront's code, and deleting the GitHub repository
 * does not clear it: after skukla/scratch-1022-b was deleted, its `scripts/aem.js`
 * still answered 200 on aem.live while every page answered 404. The Admin API's
 * `DELETE /code/{owner}/{repo}/{ref}/{path}` removes one file and purges the live CDN.
 *
 * Measured 2026-10-28 with the DA.live IMS Bearer and AFTER the repository was gone:
 * 204, then the live URL answered 404 while an untouched sibling still answered 200.
 * So this sends that Bearer and nothing else: the repository is gone, so there is no
 * GitHub token worth sending.
 */

import { ADMIN_API_401_MESSAGE } from '@/features/eds/services/helix/helixAdminErrors';
import {
    createHelixService,
    installFetchMock,
    makeGitHubTokenService,
    restoreFetch,
    type HelixServiceType,
} from './helixService.testUtils';

const res = (status: number, statusText = '', xError: string | null = null): Partial<Response> => ({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: (h: string) => (h === 'x-error' ? xError : null) } as unknown as Headers,
});

describe('HelixService.deleteCode', () => {
    let service: HelixServiceType;
    let mockFetch: jest.Mock;
    let github: ReturnType<typeof makeGitHubTokenService>;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockFetch = installFetchMock();
        github = makeGitHubTokenService();
        service = await createHelixService({ githubTokenService: github });
    });

    afterEach(restoreFetch);

    it('DELETEs the one file from the code partition with the DA.live Bearer alone', async () => {
        mockFetch.mockResolvedValue(res(204));

        await service.deleteCode('skukla', 'scratch-1022-b', '/scripts/aem.js');

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith(
            'https://admin.hlx.page/code/skukla/scratch-1022-b/main/scripts/aem.js',
            expect.objectContaining({
                method: 'DELETE',
                headers: { Authorization: 'Bearer valid-dalive-ims-token' },
                signal: expect.any(AbortSignal),
            }),
        );
        // The repository is already gone; a GitHub token is neither needed nor asked for.
        expect(github.getToken).not.toHaveBeenCalled();
    });

    it('addresses a repository path given without a leading slash, and on the branch asked for', async () => {
        mockFetch.mockResolvedValue(res(204));

        await service.deleteCode('skukla', 'site', 'styles/styles.css', 'dev');

        expect(mockFetch.mock.calls[0][0]).toBe('https://admin.hlx.page/code/skukla/site/dev/styles/styles.css');
    });

    it('treats a 404 as done: the file was already gone', async () => {
        mockFetch.mockResolvedValue(res(404, 'Not Found'));

        await expect(service.deleteCode('skukla', 'site', '/scripts/aem.js')).resolves.toBeUndefined();
    });

    it('reports a 401 as the admin-API refusal it is', async () => {
        mockFetch.mockResolvedValue(res(401, 'Unauthorized', '[admin] not authenticated'));

        await expect(service.deleteCode('skukla', 'site', '/scripts/aem.js')).rejects.toThrow(
            ADMIN_API_401_MESSAGE,
        );
    });

    it('reports any other refusal with its status and what AEM said in x-error', async () => {
        mockFetch.mockResolvedValue(res(403, 'Forbidden', '[admin] delete not allowed while source exists'));

        await expect(service.deleteCode('skukla', 'site', '/scripts/aem.js')).rejects.toThrow(
            'Failed to delete code /scripts/aem.js: 403 Forbidden — [admin] delete not allowed while source exists',
        );
    });

    it('reports a failure with no x-error by its status alone', async () => {
        mockFetch.mockResolvedValue(res(500, 'Server Error'));

        await expect(service.deleteCode('skukla', 'site', '/scripts/aem.js')).rejects.toThrow(
            /^Failed to delete code \/scripts\/aem\.js: 500 Server Error$/,
        );
    });
});
