/**
 * create_github_repo goes through the wizard's own `createRepoFromSource` (PL-104 fix 13).
 *
 * It called `createFromTemplate` directly, so a source that is not a GitHub template (an
 * added demo's repository, say) failed, where the wizard makes an empty repository and
 * resets it onto the source. These assert what GitHub was asked to do.
 */

import {
    ctxFactory,
    fakeServer,
    getGitHubServicesMock,
    gh,
    mockResetRepository,
    registerCloudResourceTools,
    resetCloudResourceMocks,
} from './cloudResourceTools.testUtils';

const ARGS = {
    templateOwner: 'colleague',
    templateRepo: 'their-demo',
    name: 'my-site',
    targetOwner: 'my-org',
};

const EMPTY_REPO = {
    id: 3,
    name: 'my-site',
    fullName: 'my-org/my-site',
    htmlUrl: 'https://github.com/my-org/my-site',
    cloneUrl: 'c',
    defaultBranch: 'main',
    isPrivate: false,
};

function serve(overrides: Parameters<typeof gh>[0]) {
    const services = gh(overrides);
    getGitHubServicesMock.mockReturnValue(services);
    const s = fakeServer();
    registerCloudResourceTools(s, ctxFactory);
    return { s, services };
}

beforeEach(() => {
    resetCloudResourceMocks();
});

describe('create_github_repo from a source that is not a template', () => {
    const notATemplate = () =>
        jest.fn(async () => ({ isTemplate: false, defaultBranch: 'develop' }));

    it('creates an empty repository and resets it onto the source', async () => {
        const createEmptyRepository = jest.fn(async () => EMPTY_REPO);
        const { s, services } = serve({ getRepository: notATemplate(), createEmptyRepository });

        const res = await s.call('create_github_repo', ARGS);

        expect(services.repoOperations.getRepository).toHaveBeenCalledWith(
            'colleague',
            'their-demo'
        );
        expect(createEmptyRepository).toHaveBeenCalledWith('my-site', false, 'my-org');
        expect(services.repoLifecycle.createFromTemplate).not.toHaveBeenCalled();
        expect(mockResetRepository).toHaveBeenCalledWith(
            expect.objectContaining({
                repoOwner: 'my-org',
                repoName: 'my-site',
                templateOwner: 'colleague',
                templateRepo: 'their-demo',
                repoBranch: 'main',
                templateBranch: 'develop',
            }),
            [],
            expect.any(String)
        );
        expect(res).toMatchObject({ created: true, repo: 'my-org/my-site' });
    });

    it('reports a reset that failed', async () => {
        mockResetRepository.mockResolvedValue({ success: false, error: 'push refused' });
        const { s } = serve({
            getRepository: notATemplate(),
            createEmptyRepository: jest.fn(async () => EMPTY_REPO),
        });

        expect(await s.call('create_github_repo', ARGS)).toEqual({
            created: false,
            error: 'push refused',
        });
    });
});

it('generates from a source GitHub flags as a template, as before', async () => {
    const { s, services } = serve({});

    await s.call('create_github_repo', ARGS);

    expect(services.repoLifecycle.createFromTemplate).toHaveBeenCalledWith(
        'colleague',
        'their-demo',
        'my-site',
        false,
        'my-org'
    );
    expect(services.repoLifecycle.createEmptyRepository).not.toHaveBeenCalled();
});
