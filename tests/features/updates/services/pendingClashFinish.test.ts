/**
 * finishClash and leaveClash — the one place a clash fixed with AI is pushed, and every
 * check before it (EDS-57 step 5), run against real git.
 *
 * Each case keeps JustRite's header clash first (keepClash, the real path), then plays the
 * AI's part by writing the file, then finishes. "GitHub" is local bare repositories.
 */

// FIRST: this module owns the jest.mock calls the imports below must see.
import {
    HEADER_ADOBE,
    HEADER_KHALIL,
    REAL_GIT_TIMEOUT_MS,
    TEMPLATE,
    finishClash,
    fx,
    git,
    hasKeptClash,
    keepClash,
    leaveClash,
    read,
    readPendingClash,
    request,
    storefrontProject,
    updateContext,
    write,
} from './keptClash.testUtils';
import { execFileSync } from 'child_process';
import { markKeptClash, readKeptClash } from '@/features/eds/services/storefront/keptClashMark';
import { readBoilerplateBase, writeBoilerplateBase } from '@/features/updates/services/boilerplateBase';
import type { PendingClash } from '@/features/updates/services/pendingClash';
import type { FinishDeps } from '@/features/updates/services/pendingClashFinish';
import type { Project } from '@/types/base';
import { gitEnv } from '../../../helpers/realGit';

const FIXED_HEADER = "// nav start\nconst dropDown = 'drop-down line with aria attributes plus the quote icon';\n// nav end\n";

/** A colleague's storefront with its Adobe base recorded, its clash kept. */
type TestDeps = FinishDeps & {
    latestTarget: jest.Mock<Promise<string | undefined>, [Project, PendingClash]>;
    recordTemplateVersion: jest.Mock;
    restorePieces: jest.Mock;
};

async function keptProject(): Promise<{ project: Project; deps: TestDeps }> {
    const project = storefrontProject();
    writeBoilerplateBase(project, {
        template: TEMPLATE,
        commit: fx.t1,
        lkgSource: { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' },
        found: 'first-commit',
    });
    const ctx = updateContext();
    await expect(keepClash(project, request(), ctx)).resolves.toMatchObject({ kind: 'kept' });
    const deps: TestDeps = {
        ctx,
        latestTarget: jest.fn(async (_project: Project, _clash: PendingClash) => fx.t2 as string | undefined),
        recordTemplateVersion: jest.fn(async () => undefined),
        restorePieces: jest.fn(async () => []),
    };
    return { project, deps };
}

const pushedHead = () => git(fx.scBare, 'rev-parse', 'main');

/** What the project's git-sync hook did before it learned to wait: commit everything, push. */
function hookCommitsAndPushes(at?: Date): void {
    git(fx.local, 'add', '-A');
    const env = { ...gitEnv(fx.home), ...(at ? { GIT_COMMITTER_DATE: at.toISOString(), GIT_AUTHOR_DATE: at.toISOString() } : {}) };
    execFileSync('git', ['commit', '-q', '-m', 'AI: sync files'], { cwd: fx.local, env, stdio: 'ignore' });
    git(fx.local, 'push', '-q', fx.scBare, 'HEAD:main');
}

describe('finishClash', () => {
    it('pushes the fixed update as one commit and records the Adobe version', async () => {
        const { project, deps } = await keptProject();
        const before = pushedHead();
        write(fx.local, 'blocks/header/header.js', FIXED_HEADER);

        const outcome = await finishClash(project, deps);

        expect(outcome).toEqual({ kind: 'finished', commit: pushedHead(), files: ['blocks/header/header.js'], notes: [] });
        expect(git(fx.scBare, 'rev-list', '--count', `${before}..main`)).toBe('1');
        expect(git(fx.scBare, 'log', '-1', '--format=%s', 'main')).toBe('chore: update the Adobe boilerplate to the tested version');
        expect(git(fx.scBare, 'show', 'main:blocks/header/header.js') + '\n').toBe(FIXED_HEADER);
        expect(git(fx.scBare, 'show', 'main:scripts/scripts.js')).toBe('scripts 2');
        expect(readBoilerplateBase(project)?.commit).toBe(fx.t2);
        expect(readPendingClash(project)).toBeUndefined();
        await expect(hasKeptClash(fx.local)).resolves.toBe(false);
        expect(deps.ctx.stateManager.saveProject).toHaveBeenCalledWith(project);
    }, REAL_GIT_TIMEOUT_MS);

    // The git-sync hook committed and pushed JustRite's whole update at the AI's first
    // edit (2026-10-21); finishing then refused it as changing files beyond the clash.
    it('finishes an update the git-sync hook already committed and pushed, with no second commit', async () => {
        const { project, deps } = await keptProject();
        write(fx.local, 'blocks/header/header.js', FIXED_HEADER);
        hookCommitsAndPushes();
        const pushedByHook = pushedHead();

        const outcome = await finishClash(project, deps);

        expect(outcome).toEqual({ kind: 'finished', commit: pushedByHook, files: ['blocks/header/header.js'], notes: [] });
        expect(pushedHead()).toBe(pushedByHook);
        expect(readBoilerplateBase(project)?.commit).toBe(fx.t2);
        expect(readPendingClash(project)).toBeUndefined();
        await expect(hasKeptClash(fx.local)).resolves.toBe(false);
    }, REAL_GIT_TIMEOUT_MS);

    // A clash kept before the record named its commit: the last commit before it was kept.
    it('finds where a clash kept before the record named its commit started, by when it was kept', async () => {
        const { project, deps } = await keptProject();
        const record = await readKeptClash(fx.local);
        await markKeptClash(fx.local, { note: record?.note ?? '', applied: record?.applied ?? {} });
        write(fx.local, 'blocks/header/header.js', FIXED_HEADER);
        hookCommitsAndPushes(new Date(Date.now() + 60_000));

        await expect(finishClash(project, deps)).resolves.toMatchObject({ kind: 'finished' });
        expect(readBoilerplateBase(project)?.commit).toBe(fx.t2);
    }, REAL_GIT_TIMEOUT_MS);

    it('still refuses a hook-committed fix that changed a file beyond the clash', async () => {
        const { project, deps } = await keptProject();
        write(fx.local, 'blocks/header/header.js', FIXED_HEADER);
        write(fx.local, 'scripts/scripts.js', 'scripts edited by hand\n');
        hookCommitsAndPushes();

        await expect(finishClash(project, deps)).resolves.toEqual({
            kind: 'not-fixed',
            reason: 'scripts/scripts.js changed too, and only blocks/header/header.js may',
        });
    }, REAL_GIT_TIMEOUT_MS);

    it('refuses while a conflict marker is left, pushing nothing', async () => {
        const { project, deps } = await keptProject();
        const before = pushedHead();

        await expect(finishClash(project, deps)).resolves.toEqual({
            kind: 'not-fixed',
            reason: 'blocks/header/header.js still has conflict markers',
        });

        expect(pushedHead()).toBe(before);
        expect(readPendingClash(project)).toBeDefined();
    }, REAL_GIT_TIMEOUT_MS);

    it('refuses a fix that also changed a file the update applied', async () => {
        const { project, deps } = await keptProject();
        write(fx.local, 'blocks/header/header.js', FIXED_HEADER);
        write(fx.local, 'scripts/scripts.js', 'tidied by the AI\n');

        await expect(finishClash(project, deps)).resolves.toEqual({
            kind: 'not-fixed',
            reason: 'scripts/scripts.js changed too, and only blocks/header/header.js may',
        });
    }, REAL_GIT_TIMEOUT_MS);

    it('refuses a fix that touched a file the update never did', async () => {
        const { project, deps } = await keptProject();
        write(fx.local, 'blocks/header/header.js', FIXED_HEADER);
        write(fx.local, 'README.md', 'notes\n');

        await expect(finishClash(project, deps)).resolves.toMatchObject({ kind: 'not-fixed', reason: expect.stringMatching(/^README\.md changed too/) });
    }, REAL_GIT_TIMEOUT_MS);

    it('refuses a fixed file that is not valid JavaScript', async () => {
        const { project, deps } = await keptProject();
        write(fx.local, 'blocks/header/header.js', 'export function decorate( {\n');

        await expect(finishClash(project, deps)).resolves.toEqual({
            kind: 'not-fixed',
            reason: 'blocks/header/header.js is not valid JavaScript',
        });
    }, REAL_GIT_TIMEOUT_MS);

    it('reads the storefront\'s ES-module syntax as valid (control for the check above)', async () => {
        const { project, deps } = await keptProject();
        write(fx.local, 'blocks/header/header.js', "import { x } from './x.js';\nexport default function decorate() { return x; }\n");

        await expect(finishClash(project, deps)).resolves.toMatchObject({ kind: 'finished' });
    }, REAL_GIT_TIMEOUT_MS);

    it('drops a fix whose update moved on, puts the copy back and pushes nothing', async () => {
        const { project, deps } = await keptProject();
        const before = pushedHead();
        write(fx.local, 'blocks/header/header.js', FIXED_HEADER);
        deps.latestTarget.mockResolvedValue('c'.repeat(40));

        await expect(finishClash(project, deps)).resolves.toEqual({ kind: 'moved-on' });

        expect(pushedHead()).toBe(before);
        expect(git(fx.local, 'status', '--porcelain')).toBe('');
        expect(read('blocks/header/header.js')).toBe(HEADER_KHALIL);
        expect(readPendingClash(project)).toBeUndefined();
        expect(readBoilerplateBase(project)?.commit).toBe(fx.t1);
    }, REAL_GIT_TIMEOUT_MS);

    it('never pushes when it cannot tell whether a newer version is out', async () => {
        const { project, deps } = await keptProject();
        write(fx.local, 'blocks/header/header.js', FIXED_HEADER);
        deps.latestTarget.mockResolvedValue(undefined);

        await expect(finishClash(project, deps)).resolves.toEqual({
            kind: 'failed',
            reason: 'could not check whether a newer version is out',
        });
        expect(readPendingClash(project)).toBeDefined();
    }, REAL_GIT_TIMEOUT_MS);

    it('keeps the fix staged for another try when GitHub refuses the push', async () => {
        const { project, deps } = await keptProject();
        write(fx.local, 'blocks/header/header.js', FIXED_HEADER);
        const instance = project.componentInstances?.['eds-storefront'];
        if (instance) instance.metadata = { ...instance.metadata, githubRepo: 'skukla/not-on-github' };

        await expect(finishClash(project, deps)).resolves.toEqual({ kind: 'failed', reason: 'GitHub refused the push' });

        // Undone to the last commit GitHub has, the fix still staged.
        expect(git(fx.local, 'rev-parse', 'HEAD')).toBe(git(fx.scBare, 'rev-parse', 'main'));
        expect(read('blocks/header/header.js')).toBe(FIXED_HEADER);
        expect(readPendingClash(project)).toBeDefined();
    }, REAL_GIT_TIMEOUT_MS);

    it("records the colleague's track through its own recorder", async () => {
        const project = storefrontProject();
        const ctx = updateContext();
        await keepClash(project, { ...request(), track: 'template', clash: { ...request().clash, source: TEMPLATE } }, ctx);
        write(fx.local, 'blocks/header/header.js', FIXED_HEADER);
        const deps = {
            ctx,
            latestTarget: jest.fn(async () => fx.t2),
            recordTemplateVersion: jest.fn(async () => undefined),
            restorePieces: jest.fn(async () => []),
        };

        await expect(finishClash(project, deps)).resolves.toMatchObject({ kind: 'finished' });

        expect(deps.recordTemplateVersion).toHaveBeenCalledWith(project, fx.t2);
        expect(git(fx.scBare, 'log', '-1', '--format=%s', 'main')).toBe('chore: sync with template');
        // Only a tested-boilerplate storefront gets its pieces put back.
        expect(deps.restorePieces).not.toHaveBeenCalled();
    }, REAL_GIT_TIMEOUT_MS);

    it('answers nothing for a project with no kept clash', async () => {
        const { deps } = await keptProject();

        await expect(finishClash(storefrontProject(), deps)).resolves.toEqual({ kind: 'nothing' });
    }, REAL_GIT_TIMEOUT_MS);
});

describe('leaveClash', () => {
    it('puts the copy back to its last commit and forgets the clash', async () => {
        const { project, deps } = await keptProject();

        await leaveClash(project, deps.ctx);

        expect(git(fx.local, 'status', '--porcelain')).toBe('');
        expect(read('blocks/header/header.js')).toBe(HEADER_KHALIL);
        expect(read('blocks/header/header.js')).not.toBe(HEADER_ADOBE);
        await expect(hasKeptClash(fx.local)).resolves.toBe(false);
        expect(readPendingClash(project)).toBeUndefined();
        expect(deps.ctx.stateManager.saveProject).toHaveBeenCalledWith(project);
    }, REAL_GIT_TIMEOUT_MS);
});
