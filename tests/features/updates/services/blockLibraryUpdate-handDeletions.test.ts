/**
 * A block library UPDATE leaves out an authoring entry the SC deleted, says so,
 * and keeps the record of what the extension added (EDS-36).
 *
 * `installBlockCollections` is REAL here, as in blockLibraryInstall.test.ts:
 * the GitHub file-operations class is the fake, so what is asserted is the
 * content handed to the commit and the record saved on the project — not what
 * a mocked installer was told to say.
 */

const fileOps = {
    listRepoFiles: jest.fn(),
    getBranchInfo: jest.fn(),
    getBlobContent: jest.fn(),
    getFileContent: jest.fn(),
    commitTreeToBranch: jest.fn(),
};

jest.mock('@/features/eds/services/github/githubFileOperations', () => ({
    GitHubFileOperations: class {
        constructor() {
            Object.assign(this, fileOps);
        }
    },
}));
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: jest.fn(() => ({ tokenService: { getToken: jest.fn() } })),
}));

import type { GitHubTreeInput } from '@/features/eds/services/types';
import {
    applyBlockLibraryUpdateResolved,
    type UpdateContext,
} from '@/features/updates/services/updateCore';
import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import {
    createComponentDef,
    createDestComponentDef,
} from '../../../helpers/componentDefinitionFixtures';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const SOURCE = { owner: 'acme', repo: 'blocks', branch: 'main' };

/** The storefront's component-definition.json, indented with four spaces. */
const STOREFRONT_DEF = JSON.stringify(JSON.parse(createDestComponentDef()), null, 4);

const LIBRARY_DEF = createComponentDef([
    { title: 'Promo', id: 'promo' },
    { title: 'Quote', id: 'quote' },
]);

function record(): InstalledBlockLibrary {
    return {
        name: 'Acme Blocks',
        source: SOURCE,
        commitSha: 'old',
        blockIds: ['promo'],
        installedAt: '2026-01-01T00:00:00.000Z',
        // Creation added the promo entry; the SC has since deleted it and its folder.
        addedEntries: { definition: ['promo'], sectionFilter: [], filters: [], models: [] },
    };
}

function edsProject(lib: InstalledBlockLibrary): Project {
    return createMockProject({
        name: 'demo',
        path: '/p/demo',
        installedBlockLibraries: [lib],
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                path: '/p/demo/components/eds-storefront',
                metadata: { githubRepo: 'me/demo-storefront' },
            },
        },
    });
}

function makeCtx() {
    return {
        secrets: createMockSecretStorage().secrets,
        extensionPath: '/ext',
        stateManager: createMockStateManager(),
        commandManager: createMockCommandExecutor(),
        logger: createMockLogger(),
    } satisfies UpdateContext;
}

beforeEach(() => {
    jest.clearAllMocks();
    fileOps.listRepoFiles.mockImplementation(async (owner: string) =>
        owner === 'me'
            ? [] // the SC deleted blocks/promo/ along with its entry
            : ['blocks/promo/promo.js', 'blocks/quote/quote.js'].map((path) => ({ path, sha: path })),
    );
    fileOps.getBranchInfo.mockResolvedValue({ commitSha: 'new', treeSha: 't' });
    fileOps.getBlobContent.mockResolvedValue('export default function() {}');
    fileOps.getFileContent.mockImplementation(async (owner: string, _repo: string, path: string) => {
        if (path !== 'component-definition.json') return null;
        const content = owner === 'me' ? STOREFRONT_DEF : LIBRARY_DEF;
        return { content, sha: 's', path, encoding: 'base64' };
    });
    fileOps.commitTreeToBranch.mockResolvedValue('commit');
});

describe('applyBlockLibraryUpdateResolved — hand deletions (EDS-36)', () => {
    it('commits the new entry, not the deleted one, in the file\'s own indentation', async () => {
        const lib = record();
        const project = edsProject(lib);

        await applyBlockLibraryUpdateResolved({ project, library: lib, latestCommit: 'new' }, 'enabled', makeCtx());

        const expected = JSON.parse(STOREFRONT_DEF);
        expected.groups[0].components.push({ title: 'Quote', id: 'quote' });
        const tree = fileOps.commitTreeToBranch.mock.calls[0][3] as GitHubTreeInput[];
        expect(fileOps.commitTreeToBranch.mock.calls[0].slice(0, 3)).toEqual(['me', 'demo-storefront', 'main']);
        expect(tree.find((e) => e.path === 'component-definition.json')?.content).toBe(
            JSON.stringify(expected, null, 4),
        );
    });

    it('returns what it left out, so both surfaces can say so', async () => {
        const lib = record();

        const leftOut = await applyBlockLibraryUpdateResolved(
            { project: edsProject(lib), library: lib, latestCommit: 'new' }, 'enabled', makeCtx(),
        );

        // The folder went with the entry, so the folder is what is named; its
        // entries are not considered at all.
        expect(leftOut).toEqual([
            { library: 'Acme Blocks', file: 'block folder blocks/promo', id: 'promo' },
        ]);
    });

    it('does not copy back the block folder the SC deleted', async () => {
        const lib = record();

        await applyBlockLibraryUpdateResolved(
            { project: edsProject(lib), library: lib, latestCommit: 'new' }, 'enabled', makeCtx(),
        );

        const tree = fileOps.commitTreeToBranch.mock.calls[0][3] as GitHubTreeInput[];
        expect(tree.map((e) => e.path).filter((path) => path.startsWith('blocks/'))).toEqual([
            'blocks/quote/quote.js',
        ]);
    });

    it('records the block it copied beside the ones copied before, so a later deletion stays deleted', async () => {
        const lib = record();
        const project = edsProject(lib);

        await applyBlockLibraryUpdateResolved({ project, library: lib, latestCommit: 'new' }, 'enabled', makeCtx());

        expect(project.installedBlockLibraries?.[0].blockIds).toEqual(['promo', 'quote']);
    });

    it('records the new entry beside the old one and saves the project', async () => {
        const lib = record();
        const project = edsProject(lib);
        const ctx = makeCtx();

        await applyBlockLibraryUpdateResolved({ project, library: lib, latestCommit: 'new' }, 'enabled', ctx);

        expect(project.installedBlockLibraries?.[0].addedEntries).toEqual({
            definition: ['promo', 'quote'], sectionFilter: [], filters: [], models: [],
        });
        expect(ctx.stateManager.saveProject).toHaveBeenCalledWith(project);
    });

    it('leaves nothing out and records nothing when sync is disabled', async () => {
        const lib = record();

        const leftOut = await applyBlockLibraryUpdateResolved(
            { project: edsProject(lib), library: lib, latestCommit: 'new' }, 'disabled', makeCtx(),
        );

        expect(leftOut).toStrictEqual([]);
        expect(fileOps.commitTreeToBranch).not.toHaveBeenCalled();
    });
});
