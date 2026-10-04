/**
 * Saving a blank-starter app to its own GitHub repository (AB-1c), and undoing it:
 * which files go (never a secret), who may be saved, what the repository gets,
 * and what the component records — so an export carries the real app and the
 * undo can put it back.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    PROMOTE_COMMIT_MESSAGE,
    collectAppFiles,
    promoteApp,
    promotionRefusal,
    unpromoteApp,
    unpromotionRefusal,
} from '@/features/app-builder/services/appRepoPromotion';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';

const SHELL = { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' };
const APP_DIR = '/projects/demo/components/my-app';

function folderWith(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-app-'));
    for (const [name, content] of Object.entries(files)) {
        const full = path.join(root, name);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
    }
    return root;
}

function shellApp(overrides: Partial<AppBuilderComponentState> = {}): AppBuilderComponentState {
    return {
        kind: 'integration',
        status: 'deployed',
        name: 'Order Sync',
        source: { ...SHELL },
        ...overrides,
    };
}

function projectWith(
    state: AppBuilderComponentState | undefined,
    appPath: string | null = APP_DIR
): Project {
    return createMockProject({
        appBuilderComponents: state ? { 'my-app': state } : {},
        componentInstances: appPath
            ? { 'my-app': { id: 'my-app', name: 'Order Sync', status: 'ready', path: appPath } }
            : {},
    });
}

describe('collectAppFiles', () => {
    it('keeps the app and drops every secret, the Adobe workspace file and build output', async () => {
        const dir = folderWith({
            'app.config.yaml': 'application: {}',
            'actions/sync/index.js': 'exports.main = () => ({})',
            '.gitignore': 'node_modules/\n',
            '.env': 'AIO_RUNTIME_AUTH=secret',
            '.env.local': 'X=secret',
            'actions/.env.production': 'Y=secret',
            '.aio': '{"project":{}}',
            'dist/bundle.js': 'built',
            '.parcel-cache/x': 'cache',
            'node_modules/a/index.js': 'dep',
        });

        const { files, leftOut } = await collectAppFiles(dir);

        expect([...files.keys()].sort()).toStrictEqual([
            '.gitignore',
            'actions/sync/index.js',
            'app.config.yaml',
        ]);
        expect(files.get('app.config.yaml')?.toString('utf-8')).toBe('application: {}');
        expect(leftOut).toBe(7);
    });

    it("honours the app's own .gitignore", async () => {
        const dir = folderWith({
            'package.json': '{}',
            'notes/draft.md': 'private',
            'build.log': 'log',
            '.gitignore': 'notes/\n*.log\n',
        });

        const { files } = await collectAppFiles(dir);

        expect([...files.keys()].sort()).toStrictEqual(['.gitignore', 'package.json']);
    });

    it('still drops the Adobe files when the app has no .gitignore at all', async () => {
        const dir = folderWith({
            'package.json': '{}',
            '.aio': '{}',
            '.env': 'S=1',
            'dist/a.js': 'x',
        });

        const { files, leftOut } = await collectAppFiles(dir);

        expect([...files.keys()]).toStrictEqual(['package.json']);
        expect(leftOut).toBe(3);
    });
});

describe('promotionRefusal', () => {
    it('allows a blank-starter app that has a folder', () => {
        expect(promotionRefusal(projectWith(shellApp()), 'my-app')).toBeUndefined();
    });

    it.each([
        ['an unknown id', projectWith(undefined), /No integration/],
        ['the mesh', projectWith(shellApp({ kind: 'mesh' })), /Only an integration/],
        [
            'an imported repository',
            projectWith(shellApp({ source: { owner: 'acme', repo: 'sync' } })),
            /already has its own repository/,
        ],
        [
            'an app already saved',
            projectWith(
                shellApp({
                    source: { owner: 'steve', repo: 'order-sync', branch: 'main' },
                    promotion: { from: { ...SHELL }, at: '2026-10-05T00:00:00.000Z' },
                })
            ),
            /already saved to steve\/order-sync/,
        ],
        ['an app with no folder', projectWith(shellApp(), null), /folder/],
    ])('refuses %s', (_label, project, why) => {
        expect(promotionRefusal(project, 'my-app')).toMatch(why);
    });
});

function deps() {
    return {
        repoOps: {
            createEmptyRepository: jest.fn().mockResolvedValue({
                id: 1,
                name: 'order-sync',
                fullName: 'steve/order-sync',
                htmlUrl: 'https://github.com/steve/order-sync',
                cloneUrl: 'https://github.com/steve/order-sync.git',
                defaultBranch: 'main',
            }),
            waitForContent: jest.fn().mockResolvedValue(true),
            deleteRepository: jest.fn().mockResolvedValue(undefined),
        },
        fileOps: {
            getBranchInfo: jest.fn().mockResolvedValue({ commitSha: 'head', treeSha: 't0' }),
            createBlob: jest.fn(),
            createTree: jest.fn().mockResolvedValue('tree-1'),
            createCommit: jest.fn().mockResolvedValue('c1'),
            updateBranchRef: jest.fn().mockResolvedValue(undefined),
        },
        logger: createMockLogger(),
        now: () => '2026-10-05T01:02:03.000Z',
    };
}

describe('promoteApp', () => {
    const files = new Map([['app.config.yaml', Buffer.from('application: {}')]]);

    it('creates a PUBLIC repository, pushes the files as one commit and records where the app came from', async () => {
        const d = deps();
        const project = projectWith(shellApp());

        const saved = await promoteApp(d, project, 'my-app', { repoName: 'order-sync', files });

        expect(d.repoOps.createEmptyRepository).toHaveBeenCalledWith(
            'order-sync',
            false,
            undefined
        );
        expect(d.repoOps.waitForContent).toHaveBeenCalledWith('steve', 'order-sync');
        expect(d.fileOps.createCommit).toHaveBeenCalledWith(
            'steve',
            'order-sync',
            PROMOTE_COMMIT_MESSAGE,
            'tree-1',
            'head'
        );
        expect(saved).toStrictEqual({
            owner: 'steve',
            repo: 'order-sync',
            url: 'https://github.com/steve/order-sync',
            fileCount: 1,
        });
        expect(project.appBuilderComponents?.['my-app']).toMatchObject({
            source: { owner: 'steve', repo: 'order-sync', branch: 'main' },
            promotion: { from: SHELL, at: '2026-10-05T01:02:03.000Z' },
        });
    });

    it('creates it under the organisation the SC picked', async () => {
        const d = deps();
        await promoteApp(d, projectWith(shellApp()), 'my-app', {
            repoName: 'order-sync',
            owner: 'acme',
            files,
        });
        expect(d.repoOps.createEmptyRepository).toHaveBeenCalledWith('order-sync', false, 'acme');
    });

    it('refuses before creating anything when the app cannot be saved, or there is nothing to push', async () => {
        const d = deps();
        await expect(
            promoteApp(
                d,
                projectWith(shellApp({ source: { owner: 'acme', repo: 'sync' } })),
                'my-app',
                {
                    repoName: 'x',
                    files,
                }
            )
        ).rejects.toThrow(/already has its own repository/);
        await expect(
            promoteApp(d, projectWith(shellApp()), 'my-app', { repoName: 'x', files: new Map() })
        ).rejects.toThrow(/no files/);
        expect(d.repoOps.createEmptyRepository).not.toHaveBeenCalled();
    });

    it('records nothing when the push fails, and says the empty repository is left behind', async () => {
        const d = deps();
        d.fileOps.createTree.mockRejectedValue(new Error('rate limited'));
        const project = projectWith(shellApp());

        await expect(
            promoteApp(d, project, 'my-app', { repoName: 'order-sync', files })
        ).rejects.toThrow(
            /steve\/order-sync was created but the files did not reach it: rate limited/
        );
        expect(project.appBuilderComponents?.['my-app']?.source).toStrictEqual(SHELL);
        expect(project.appBuilderComponents?.['my-app']?.promotion).toBeUndefined();
    });
});

describe('unpromoteApp (the undo)', () => {
    function promoted(): Project {
        return projectWith(
            shellApp({
                source: { owner: 'steve', repo: 'order-sync', branch: 'main' },
                promotion: { from: { ...SHELL }, at: '2026-10-05T00:00:00.000Z' },
            })
        );
    }

    it('deletes the repository Demo Builder made and puts the blank starter back as the source', async () => {
        const d = deps();
        const project = promoted();

        await unpromoteApp(d, project, 'my-app');

        expect(d.repoOps.deleteRepository).toHaveBeenCalledWith('steve', 'order-sync');
        expect(project.appBuilderComponents?.['my-app']?.source).toStrictEqual(SHELL);
        expect(project.appBuilderComponents?.['my-app']?.promotion).toBeUndefined();
    });

    it('still puts the source back when the repository is already gone', async () => {
        const d = deps();
        d.repoOps.deleteRepository.mockRejectedValue(
            Object.assign(new Error('Not Found'), { status: 404 })
        );
        const project = promoted();

        await unpromoteApp(d, project, 'my-app');

        expect(project.appBuilderComponents?.['my-app']?.source).toStrictEqual(SHELL);
    });

    it('changes nothing when GitHub refuses the delete', async () => {
        const d = deps();
        d.repoOps.deleteRepository.mockRejectedValue(new Error('missing delete_repo scope'));
        const project = promoted();

        await expect(unpromoteApp(d, project, 'my-app')).rejects.toThrow(/delete_repo/);
        expect(project.appBuilderComponents?.['my-app']?.promotion).toBeDefined();
    });

    it('refuses an app Demo Builder did not save, without touching GitHub', async () => {
        const d = deps();
        expect(unpromotionRefusal(projectWith(shellApp()), 'my-app')).toMatch(/was not saved/);
        await expect(unpromoteApp(d, projectWith(shellApp()), 'my-app')).rejects.toThrow(
            /was not saved/
        );
        expect(d.repoOps.deleteRepository).not.toHaveBeenCalled();
    });
});
