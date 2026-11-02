/**
 * A release of eds-demo-patches that only changes patches leaves the tested commit where it
 * was, so the merge has nothing of Adobe's to apply. The fixes still have to land (real git).
 *
 * The update path answered "no template change" and pushed nothing, so such a release could
 * reach no storefront even once it was offered. What the patches themselves do is pinned in
 * `codePatchRegistry.test.ts`; here `reapplyPatchesInCheckout` stands in, writing a file.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { reapplyPatchesInCheckout } from '@/features/updates/services/thinLayerUpdate';
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import type { Project } from '@/types/base';
import { githubAccessFor } from '../../../helpers/githubAccessFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { realGitExecutor, runGit } from '../../../helpers/realGit';
import { createMockSecretStorage, githubTokenSecret } from '../../../helpers/secretStorageFake';

const TESTED = jest.fn<Promise<string | undefined>, []>();
jest.mock('@/features/eds/services/patches/lkgReader', () => ({
    ...jest.requireActual('@/features/eds/services/patches/lkgReader'),
    readLkgSha: () => TESTED(),
}));
jest.mock('@/features/updates/services/thinLayerUpdate', () => ({
    ...jest.requireActual('@/features/updates/services/thinLayerUpdate'),
    reapplyPatchesInCheckout: jest.fn(),
}));

const reapply = reapplyPatchesInCheckout as jest.Mock;
const REAL_GIT_TIMEOUT_MS = 60_000;
const SC_REPO = 'skukla/kukla-demo';
const ADOBE = 'adobe-commerce/boilerplate-b2b-template';

let root = '';
let home = '';
const git = (cwd: string, ...args: string[]) => runGit(home, cwd, ...args);
const bareOf = (repo: string) => path.join(root, 'github', `${repo}.git`);
const originHead = () => git(bareOf(SC_REPO), 'rev-parse', 'main');

function repoWith(ownerRepo: string, tree: Record<string, string>): string {
    const work = path.join(root, 'work', ownerRepo);
    fs.mkdirSync(work, { recursive: true });
    git(work, 'init', '-q', '-b', 'main');
    for (const [file, text] of Object.entries(tree)) {
        fs.mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
        fs.writeFileSync(path.join(work, file), text);
    }
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', 'first');
    fs.mkdirSync(bareOf(ownerRepo), { recursive: true });
    git(bareOf(ownerRepo), 'init', '-q', '--bare', '-b', 'main');
    git(work, 'push', '-q', bareOf(ownerRepo), 'main');
    return git(work, 'rev-parse', 'HEAD');
}

function project(commit: string): Project {
    return createMockProject({
        name: 'demo',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                metadata: {
                    githubRepo: SC_REPO,
                    templateOwner: 'adobe-commerce',
                    templateRepo: 'boilerplate-b2b-template',
                    lastSyncedCommit: commit,
                    lkgSource: { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' },
                },
            },
        },
    });
}

function service(): TemplateSyncService {
    const logger = createMockLogger();
    const access = githubAccessFor(createMockSecretStorage(githubTokenSecret('gh-token')).secrets, logger);
    jest.spyOn(access.fileOperations, 'getFileContent').mockRejectedValue(new Error('no GitHub API in this test'));
    return new TemplateSyncService(
        { ...access, tokenService: { getToken: async () => ({ token: 'gh-token', tokenType: 'bearer', scopes: [] }) } },
        logger,
        realGitExecutor(root, home),
    );
}

beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'patches-release-')));
    home = path.join(root, 'home');
    fs.mkdirSync(home);
    jest.clearAllMocks();
    reapply.mockResolvedValue([]);
});
afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

function bothRepos(): string {
    const tree = { 'scripts/scripts.js': 'const a = 1;\n' };
    const commit = repoWith(ADOBE, tree);
    repoWith(SC_REPO, tree);
    TESTED.mockResolvedValue(commit);
    return commit;
}

describe('a release that only changes patches', () => {
    it('pushes the fixes it carries, with the tested commit unmoved', async () => {
        const commit = bothRepos();
        const before = originHead();
        reapply.mockImplementation(async (repoDir: string) => {
            fs.writeFileSync(path.join(repoDir, 'scripts/scripts.js'), 'const a = 2;\n');
            return [];
        });

        const result = await service().syncWithTemplate(project(commit), { strategy: 'merge' });

        expect(result).toMatchObject({ success: true, syncedCommit: commit });
        expect(originHead()).not.toBe(before);
        expect(git(bareOf(SC_REPO), 'show', 'main:scripts/scripts.js')).toBe('const a = 2;');
    }, REAL_GIT_TIMEOUT_MS);

    it('pushes nothing when no fix changes anything', async () => {
        const commit = bothRepos();
        const before = originHead();

        const result = await service().syncWithTemplate(project(commit), { strategy: 'merge' });

        expect(result.success).toBe(true);
        expect(originHead()).toBe(before);
    }, REAL_GIT_TIMEOUT_MS);

    it('says which fix could not be put back', async () => {
        const commit = bothRepos();
        reapply.mockResolvedValue([{ patchId: 'a-fix', applied: false, reason: 'precondition gone' }]);

        const result = await service().syncWithTemplate(project(commit), { strategy: 'merge' });

        expect(result.notes).toEqual(
            expect.arrayContaining([expect.stringContaining('a-fix')]),
        );
    }, REAL_GIT_TIMEOUT_MS);
});
