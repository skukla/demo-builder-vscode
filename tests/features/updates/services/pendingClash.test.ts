/**
 * keepClash — a stopped update's clash is applied again in the project's local storefront
 * copy and kept there for the SC's AI to fix, and recorded on the project (EDS-57 step 2).
 *
 * WHY REAL GIT. What is pinned is what git leaves behind: markers in the clashing file, the
 * clean files staged, and a copy put back exactly when the clash is not the clone's. A
 * scripted git cannot leave anything behind. "GitHub" is local bare repositories; the code's
 * https://github.com URLs are pointed at them by the executor (the seam in
 * templateMergeBase.test.ts).
 *
 * SAFETY. Every git process runs with every `GIT_*` variable removed and HOME in the temp root.
 */

import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type { ExecuteOptions } from '@/core/shell/types';
import {
    keepClash,
    readPendingClash,
    writePendingClash,
    type KeepClashRequest,
    type PendingClash,
} from '@/features/updates/services/pendingClash';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { Project } from '@/types/base';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const mockGetToken = jest.fn();
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: () => ({ tokenService: { getToken: () => mockGetToken() } }),
}));

const REAL_GIT_TIMEOUT_MS = 60_000;
const SC_REPO = 'skukla/kukla-justrite';
const TEMPLATE = { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' };
const GITHUB_URL = /https:\/\/(?:[^@\s"]+@)?github\.com\/([^/\s"]+)\/([^/\s"]+?)\.git/g;

const HEADER_BASE = 'nav start\ndrop-down line\nnav end\n';
const HEADER_ADOBE = 'nav start\ndrop-down line with aria attributes\nnav end\n';
const HEADER_KHALIL = 'nav start\ndrop-down line plus the quote icon\nnav end\n';

interface Fixture {
    root: string;
    home: string;
    t1: string;
    t2: string;
    scBare: string;
    local: string;
}

let fx: Fixture;

function gitEnv(home: string): NodeJS.ProcessEnv {
    const inherited = Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'));
    return {
        ...Object.fromEntries(inherited),
        HOME: home,
        XDG_CONFIG_HOME: home,
        GIT_AUTHOR_NAME: 'test',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
    };
}

function git(cwd: string, ...args: string[]): string {
    return execFileSync('git', args, { cwd, env: gitEnv(fx.home), encoding: 'utf8' }).trim();
}

function write(dir: string, file: string, content: string): void {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
}

const read = (file: string) => fs.readFileSync(path.join(fx.local, file), 'utf8');

function bare(ownerRepo: string): string {
    const dir = path.join(fx.root, 'github', `${ownerRepo}.git`);
    fs.mkdirSync(dir, { recursive: true });
    git(dir, 'init', '-q', '--bare', '-b', 'main');
    return dir;
}

/** Adobe's template: T1 (where the storefront started) → T2 (the tested version). */
function buildTemplate(): { t1: string; t2: string } {
    const work = path.join(fx.root, 'template-work');
    fs.mkdirSync(work);
    git(work, 'init', '-q', '-b', 'main');
    write(work, 'blocks/header/header.js', HEADER_BASE);
    write(work, 'scripts/scripts.js', 'scripts 1\n');
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', 'T1');
    const t1 = git(work, 'rev-parse', 'HEAD');
    write(work, 'blocks/header/header.js', HEADER_ADOBE);
    write(work, 'scripts/scripts.js', 'scripts 2\n');
    write(work, 'scripts/new.js', 'new in Adobe\n');
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', 'T2');
    git(work, 'push', '-q', bare(`${TEMPLATE.owner}/${TEMPLATE.repo}`), 'main');
    return { t1, t2: git(work, 'rev-parse', 'HEAD') };
}

/** The storefront: its own first commit with T1's files, then Khalil's header edit. */
function buildStorefront(): string {
    const work = path.join(fx.root, 'sc-work');
    fs.mkdirSync(work);
    git(work, 'init', '-q', '-b', 'main');
    write(work, 'blocks/header/header.js', HEADER_BASE);
    write(work, 'scripts/scripts.js', 'scripts 1\n');
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', 'Initial commit');
    write(work, 'blocks/header/header.js', HEADER_KHALIL);
    git(work, 'commit', '-q', '-am', 'edit nav bar and request a quote icon');
    const scBare = bare(SC_REPO);
    git(work, 'push', '-q', scBare, 'main');
    return scBare;
}

function realGitExecutor() {
    const execute = async (command: string, options: ExecuteOptions = {}) => {
        if (!command.startsWith('git ')) throw new Error(`not a git command: ${command}`);
        const local = command.replace(GITHUB_URL, (_url, owner: string, repo: string) =>
            pathToFileURL(path.join(fx.root, 'github', owner, `${repo}.git`)).href,
        );
        const r = spawnSync('/bin/bash', ['-c', local], { cwd: options.cwd, env: gitEnv(fx.home), encoding: 'utf8' });
        return { code: r.status, stdout: r.stdout, stderr: r.stderr, duration: 0 };
    };
    return createMockCommandExecutor({ execute: jest.fn(execute) });
}

function storefrontProject(): Project {
    return createMockProject({
        name: 'justrite',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                path: fx.local,
                metadata: { githubRepo: SC_REPO },
            },
        },
    });
}

function updateContext(): UpdateContext {
    return {
        secrets: createMockSecretStorage().secrets,
        extensionPath: '/ext',
        stateManager: createMockStateManager(),
        commandManager: realGitExecutor(),
        logger: createMockLogger(),
    };
}

function request(conflicts = ['blocks/header/header.js']): KeepClashRequest {
    return {
        track: 'boilerplate',
        clash: { source: TEMPLATE, base: fx.t1, target: fx.t2, preserveFiles: ['fstab.yaml', 'config.json'] },
        conflicts,
        fixes: false,
    };
}

beforeEach(() => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kept-clash-test-')));
    const home = path.join(root, 'home');
    fs.mkdirSync(home);
    fx = { root, home, t1: '', t2: '', scBare: '', local: path.join(root, 'local') };
    Object.assign(fx, buildTemplate());
    fx.scBare = buildStorefront();
    git(root, 'clone', '-q', fx.scBare, 'local');
    mockGetToken.mockResolvedValue({ token: 'gh-token' });
});

afterEach(() => {
    fs.rmSync(fx.root, { recursive: true, force: true });
});

describe('keepClash', () => {
    it('keeps the clash in the local copy: markers in the clashing file, the rest staged, nothing pushed', async () => {
        const project = storefrontProject();
        const pushedBefore = git(fx.scBare, 'rev-parse', 'main');

        await expect(keepClash(project, request(), updateContext())).resolves.toEqual({
            kind: 'kept',
            storefrontPath: fx.local,
            files: ['blocks/header/header.js'],
        });

        const header = read('blocks/header/header.js');
        expect(header).toMatch(/^<{7}/m);
        expect(header).toContain('drop-down line plus the quote icon');
        expect(header).toContain('drop-down line with aria attributes');
        expect(read('scripts/scripts.js')).toBe('scripts 2\n');
        expect(git(fx.local, 'diff', '--cached', '--name-only', '--diff-filter=AM').split('\n').sort()).toEqual([
            'scripts/new.js',
            'scripts/scripts.js',
        ]);
        expect(git(fx.local, 'diff', '--name-only', '--diff-filter=U')).toBe('blocks/header/header.js');
        expect(git(fx.scBare, 'rev-parse', 'main')).toBe(pushedBefore);
    }, REAL_GIT_TIMEOUT_MS);

    it('records the clash on the project, with the change it belongs to', async () => {
        const project = storefrontProject();

        await keepClash(project, request(), updateContext());

        expect(readPendingClash(project)).toEqual({
            track: 'boilerplate',
            source: TEMPLATE,
            base: fx.t1,
            target: fx.t2,
            files: ['blocks/header/header.js'],
            fixes: false,
            keptAt: expect.any(String),
        });
    }, REAL_GIT_TIMEOUT_MS);

    it('brings a stale copy up to GitHub first, so the clash is kept against the real storefront', async () => {
        // The copy was made before Khalil's edit reached it.
        git(fx.local, 'reset', '-q', '--hard', 'HEAD~1');
        const project = storefrontProject();

        await expect(keepClash(project, request(), updateContext())).resolves.toMatchObject({ kind: 'kept' });

        expect(read('blocks/header/header.js')).toContain('drop-down line plus the quote icon');
    }, REAL_GIT_TIMEOUT_MS);

    it('keeps nothing in a copy holding a change GitHub lacks, and leaves that change alone', async () => {
        write(fx.local, 'notes.txt', 'only here\n');
        const project = storefrontProject();

        await expect(keepClash(project, request(), updateContext())).resolves.toEqual({
            kind: 'not-kept',
            reason: 'its local copy was left as it is: it has a local change GitHub does not have (notes.txt)',
        });

        expect(read('notes.txt')).toBe('only here\n');
        expect(read('blocks/header/header.js')).toBe(HEADER_KHALIL);
        expect(readPendingClash(project)).toBeUndefined();
    }, REAL_GIT_TIMEOUT_MS);

    it('puts the copy back when the change does not clash there the way it did on GitHub', async () => {
        const project = storefrontProject();

        const outcome = await keepClash(project, request(['scripts/scripts.js']), updateContext());

        expect(outcome).toEqual({ kind: 'not-kept', reason: 'the change did not clash there the way it did on GitHub' });
        expect(git(fx.local, 'status', '--porcelain')).toBe('');
        expect(readPendingClash(project)).toBeUndefined();
    }, REAL_GIT_TIMEOUT_MS);

    it('keeps nothing without a GitHub token', async () => {
        mockGetToken.mockResolvedValue(undefined);
        const ctx = updateContext();

        await expect(keepClash(storefrontProject(), request(), ctx)).resolves.toEqual({
            kind: 'not-kept',
            reason: 'GitHub is not signed in',
        });
        expect(ctx.commandManager.execute).not.toHaveBeenCalled();
    });
});

describe('readPendingClash', () => {
    const clash: PendingClash = {
        track: 'template',
        source: { owner: 'kmanns', repo: 'justrite' },
        base: 'a'.repeat(40),
        target: 'b'.repeat(40),
        files: ['blocks/header/header.js'],
        fixes: false,
        keptAt: '2026-10-21T00:00:00.000Z',
    };

    it('reads back what was written, and nothing once removed', () => {
        const project = createMockProject({
            componentInstances: { 'eds-storefront': { id: 'eds-storefront', name: 'EDS Storefront', status: 'ready', metadata: {} } },
        });

        writePendingClash(project, clash);
        expect(readPendingClash(project)).toEqual(clash);

        writePendingClash(project, undefined);
        expect(readPendingClash(project)).toBeUndefined();
    });

    it.each([
        ['an unknown track', { ...clash, track: 'fork' }],
        ['a short commit', { ...clash, base: 'abc1234' }],
        ['no files', { ...clash, files: [] }],
    ])('reads %s as none', (_label, value) => {
        const project = createMockProject({
            componentInstances: {
                'eds-storefront': { id: 'eds-storefront', name: 'EDS Storefront', status: 'ready', metadata: { pendingClash: value } },
            },
        });

        expect(readPendingClash(project)).toBeUndefined();
    });
});
