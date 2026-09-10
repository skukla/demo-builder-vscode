/**
 * Syncing a storefront with its upstream template — the plumbing.
 *
 * The sibling `-safety` suite pins the guarantees (preserved files survive, a
 * failed step never pushes, conflicts surface). This one pins what the service
 * actually HANDS its collaborators: the exact git commands and their cwd /
 * timeout / shell options in order for each strategy, the token in the clone
 * URL, the temp-dir cleanup, the metadata guards, and what each result carries.
 */

import {
    REPO_DIR,
    TEMP_DIR,
    answer,
    edsProject,
    failOn,
    gitCalls,
    mockExecute,
    mockGetToken,
    mockMkdir,
    mockMkdtemp,
    mockReadFile,
    mockRm,
    mockWriteFile,
    pushed,
    resetFakes,
    service,
} from './templateSyncService.testUtils';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';

const opts = (cwd: string, timeout: number) => ({ cwd, timeout, shell: DEFAULT_SHELL });
const TEMPLATE_URL = 'https://github.com/adobe/aem-boilerplate-commerce.git';
const MISSING = 'Missing required metadata: githubRepo, templateOwner, or templateRepo';
const NO_EDS = 'No EDS metadata found in project';

/** The steps both strategies share once the user repo is on disk. */
const FETCH_STEPS = [
    [`git remote add template "${TEMPLATE_URL}"`, opts(REPO_DIR, TIMEOUTS.QUICK)],
    ['git fetch template main', opts(REPO_DIR, TIMEOUTS.LONG)],
];
const RESET_STEPS = [
    ['git read-tree --reset -u template/main', opts(REPO_DIR, TIMEOUTS.NORMAL)],
    ['git add -A', opts(REPO_DIR, TIMEOUTS.QUICK)],
    ['git status --porcelain', opts(REPO_DIR, TIMEOUTS.QUICK)],
    ['git commit -m "chore: sync with template (reset)"', opts(REPO_DIR, TIMEOUTS.QUICK)],
    ['git rev-parse HEAD', opts(REPO_DIR, TIMEOUTS.QUICK)],
    ['git push origin main --force', opts(REPO_DIR, TIMEOUTS.LONG)],
];

/** A project whose EDS component exists but carries no metadata. */
function edsWithoutMetadata() {
    return createMockProject({
        componentInstances: {
            'eds-storefront': { id: 'eds-storefront', name: 'EDS', status: 'ready' },
        },
    });
}

/** git answers: a dirty status and a known HEAD, everything else silent success. */
function dirtyTreeAtHead(sha: string): void {
    mockExecute.mockImplementation(async (cmd: string) => ({
        code: 0,
        stdout: /git rev-parse/.test(cmd) ? `${sha}\n` : /git status/.test(cmd) ? 'M x\n' : '',
        stderr: '',
    }));
}

/** git answers: a dirty status, and the commit step failing. */
function commitFails(stderr: string): void {
    mockExecute.mockImplementation(async (cmd: string) => {
        if (/git status/.test(cmd)) return { code: 0, stdout: 'M x\n', stderr: '' };
        if (/git commit/.test(cmd)) return { code: 1, stdout: '', stderr };
        return { code: 0, stdout: '', stderr: '' };
    });
}

/**
 * The clone step, read back by PART. The command carries the token inside the URL
 * (the token-colon-x-oauth-basic-at-github form), and that literal — even with a fake
 * token — is a credential-shaped string the public repo's secret scanner flags
 * (GitGuardian, 2026-09-03). Parsing the URL proves the same contract without ever
 * spelling it.
 */
function expectClone(call: unknown[] | undefined, depth: number): void {
    const [cmd, options] = call ?? [];
    const m = String(cmd).match(/^git clone --depth (\d+) --branch main "([^"]+)" repo$/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(depth);
    const url = new URL(m![2]);
    expect(url.username).toBe('gh-token');
    expect(url.password).toBe('x-oauth-basic');
    expect(url.host).toBe('github.com');
    expect(url.pathname).toBe('/skukla/demo-storefront.git');
    expect(options).toEqual(opts(TEMP_DIR, TIMEOUTS.LONG));
}

beforeEach(() => {
    resetFakes();
});

describe('before touching git', () => {
    it.each([
        ['no EDS component at all', createMockProject({ componentInstances: undefined }), NO_EDS],
        ['an EDS component without metadata', edsWithoutMetadata(), NO_EDS],
        ['no githubRepo', edsProject({ githubRepo: undefined }), MISSING],
        ['no templateOwner', edsProject({ templateOwner: undefined }), MISSING],
        ['no templateRepo', edsProject({ templateRepo: undefined }), MISSING],
        [
            'a githubRepo with no slash',
            edsProject({ githubRepo: 'nodash' }),
            'Invalid githubRepo format: nodash',
        ],
        [
            'a githubRepo with an empty name',
            edsProject({ githubRepo: 'skukla/' }),
            'Invalid githubRepo format: skukla/',
        ],
    ])(
        '%s: refuses with the requested strategy and runs nothing',
        async (_label, project, error) => {
            const result = await service().syncWithTemplate(project, { strategy: 'reset' });

            expect(result).toEqual({ success: false, strategy: 'reset', syncedCommit: '', error });
            expect(mockExecute).not.toHaveBeenCalled();
            expect(mockMkdtemp).not.toHaveBeenCalled();
        }
    );

    it.each(['merge', 'reset'] as const)(
        '%s without a GitHub token: refuses before making a temp dir',
        async (strategy) => {
            mockGetToken.mockResolvedValue(null);

            const result = await service().syncWithTemplate(edsProject(), { strategy });

            expect(result).toEqual({
                success: false,
                strategy,
                syncedCommit: '',
                error: 'Not authenticated with GitHub',
            });
            expect(mockMkdtemp).not.toHaveBeenCalled();
            expect(mockExecute).not.toHaveBeenCalled();
        }
    );

    it('backs up the two default files, and only those, when no extras are asked for', async () => {
        await service().syncWithTemplate(edsProject(), { strategy: 'reset' });

        expect(mockReadFile.mock.calls.map((c) => c[0])).toEqual([
            `${REPO_DIR}/fstab.yaml`,
            `${REPO_DIR}/config.json`,
        ]);
    });

    it('backs up the extra files after the defaults', async () => {
        await service().syncWithTemplate(edsProject(), {
            strategy: 'reset',
            preserveFiles: ['custom.txt'],
        });

        expect(mockReadFile.mock.calls.map((c) => c[0])).toEqual([
            `${REPO_DIR}/fstab.yaml`,
            `${REPO_DIR}/config.json`,
            `${REPO_DIR}/custom.txt`,
        ]);
    });
});

describe('merge strategy — the exact git conversation', () => {
    it('clones 50 deep with the token in the URL, merges without committing, commits and pushes', async () => {
        dirtyTreeAtHead('abc123');

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expectClone(mockExecute.mock.calls[0], 50);
        expect(mockExecute.mock.calls.slice(1)).toEqual([
            ...FETCH_STEPS,
            ['git merge template/main --no-commit --no-ff', opts(REPO_DIR, TIMEOUTS.NORMAL)],
            ['git diff --name-only --diff-filter=U', opts(REPO_DIR, TIMEOUTS.QUICK)],
            ['git add -A', opts(REPO_DIR, TIMEOUTS.QUICK)],
            ['git status --porcelain', opts(REPO_DIR, TIMEOUTS.QUICK)],
            ['git commit -m "chore: sync with template"', opts(REPO_DIR, TIMEOUTS.QUICK)],
            ['git rev-parse HEAD', opts(REPO_DIR, TIMEOUTS.QUICK)],
            ['git push origin main', opts(REPO_DIR, TIMEOUTS.LONG)],
        ]);
        expect(result).toEqual({ success: true, strategy: 'merge', syncedCommit: 'abc123' });
    });

    it('does not commit when the working tree is clean — whitespace-only status included', async () => {
        answer(/git status --porcelain/, '\n');

        await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(gitCalls()).not.toContainEqual(expect.stringMatching(/git commit/));
        expect(pushed()).toBe(true);
    });

    it('treats whitespace-only output from the conflict probe as no conflicts', async () => {
        answer(/diff-filter=U/, ' \n');

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(result).toMatchObject({ success: true, strategy: 'merge' });
        expect(gitCalls()).not.toContainEqual(expect.stringMatching(/merge --abort|read-tree/));
    });

    it('on conflicts: aborts the merge, restores the backups, then runs the reset conversation', async () => {
        answer(/diff-filter=U/, 'blocks/hero/hero.js\n');

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(mockExecute.mock.calls.slice(5)).toEqual([
            ['git merge --abort', opts(REPO_DIR, TIMEOUTS.QUICK)],
            ...RESET_STEPS.filter(([cmd]) => !/git commit/.test(String(cmd))),
        ]);
        expect(result).toEqual({
            success: true,
            strategy: 'reset',
            syncedCommit: '',
            conflicts: ['blocks/hero/hero.js'],
            fallbackOccurred: true,
        });
    });

    it('a failed commit is reported and never pushed', async () => {
        commitFails('hook rejected');

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(result).toEqual({
            success: false,
            strategy: 'merge',
            syncedCommit: '',
            error: 'Failed to commit: hook rejected',
        });
        expect(pushed()).toBe(false);
    });
});

describe('reset strategy — the exact git conversation', () => {
    it('clones 1 deep, reads the template tree over the checkout, commits and force-pushes', async () => {
        dirtyTreeAtHead('def456');

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'reset' });

        expectClone(mockExecute.mock.calls[0], 1);
        expect(mockExecute.mock.calls.slice(1)).toEqual([...FETCH_STEPS, ...RESET_STEPS]);
        expect(result).toEqual({ success: true, strategy: 'reset', syncedCommit: 'def456' });
    });

    it('does not commit when the tree already matches the template', async () => {
        answer(/git status --porcelain/, '\n');

        await service().syncWithTemplate(edsProject(), { strategy: 'reset' });

        expect(gitCalls()).not.toContainEqual(expect.stringMatching(/git commit/));
        expect(pushed()).toBe(true);
    });

    it.each([
        ['clone', /git clone/, 'Failed to clone user repo: boom'],
        ['fetch', /git fetch/, 'Failed to fetch template: boom'],
        ['read-tree', /git read-tree/, 'Failed to read template tree: boom'],
    ])('a failed %s is reported and never pushed', async (_step, pattern, error) => {
        failOn(pattern);

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'reset' });

        expect(result).toEqual({ success: false, strategy: 'reset', syncedCommit: '', error });
        expect(pushed()).toBe(false);
    });

    it('a failed commit is reported and never pushed', async () => {
        commitFails('nope');

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'reset' });

        expect(result).toEqual({
            success: false,
            strategy: 'reset',
            syncedCommit: '',
            error: 'Failed to commit: nope',
        });
        expect(pushed()).toBe(false);
    });

    it('a failed push is reported as a failure', async () => {
        failOn(/git push/);

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'reset' });

        expect(result).toEqual({
            success: false,
            strategy: 'reset',
            syncedCommit: '',
            error: 'Failed to push: boom',
        });
    });
});

describe('temp dir and preserved-file plumbing', () => {
    it.each(['merge', 'reset'] as const)(
        '%s: removes the temp dir recursively after success',
        async (strategy) => {
            await service().syncWithTemplate(edsProject(), { strategy });

            expect(mockRm).toHaveBeenCalledWith(TEMP_DIR, { recursive: true, force: true });
        }
    );

    it.each(['merge', 'reset'] as const)(
        '%s: removes the temp dir after a failed step too',
        async (strategy) => {
            failOn(/git clone/);

            await service().syncWithTemplate(edsProject(), { strategy });

            expect(mockRm).toHaveBeenCalledWith(TEMP_DIR, { recursive: true, force: true });
        }
    );

    it.each(['merge', 'reset'] as const)(
        '%s: a cleanup failure is warned about and does not fail the sync',
        async (strategy) => {
            const logger = createMockLogger();
            mockRm.mockRejectedValue(new Error('EBUSY'));

            const result = await service(logger).syncWithTemplate(edsProject(), { strategy });

            expect(result.success).toBe(true);
            expect(logger.warn).toHaveBeenCalledTimes(1);
        }
    );

    it('a successful cleanup warns about nothing', async () => {
        const logger = createMockLogger();

        await service(logger).syncWithTemplate(edsProject(), { strategy: 'reset' });

        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('restores each backup by creating its directory first', async () => {
        await service().syncWithTemplate(edsProject(), { strategy: 'reset' });

        expect(mockMkdir).toHaveBeenCalledWith(REPO_DIR, { recursive: true });
        expect(mockWriteFile).toHaveBeenCalledWith(`${REPO_DIR}/fstab.yaml`, 'MOUNTS', 'utf-8');
    });

    it('a file that cannot be restored is warned about and the sync still completes', async () => {
        const logger = createMockLogger();
        mockWriteFile.mockRejectedValue(new Error('EACCES'));

        const result = await service(logger).syncWithTemplate(edsProject(), { strategy: 'reset' });

        expect(result.success).toBe(true);
        expect(logger.warn).toHaveBeenCalledTimes(2);
    });
});

describe('updateLastSyncedCommit', () => {
    it('writes the commit onto the EDS metadata and saves the project', async () => {
        const project = edsProject();
        const saveProject = jest.fn().mockResolvedValue(undefined);

        await service().updateLastSyncedCommit(project, 'abc1234567', { saveProject });

        expect(project.componentInstances!['eds-storefront'].metadata).toMatchObject({
            lastSyncedCommit: 'abc1234567',
        });
        expect(saveProject).toHaveBeenCalledWith(project);
    });

    it.each([
        ['no EDS component', createMockProject({ componentInstances: undefined })],
        ['an EDS component without metadata', edsWithoutMetadata()],
    ])('%s: saves nothing and does not throw', async (_label, project) => {
        const saveProject = jest.fn();

        await expect(
            service().updateLastSyncedCommit(project, 'abc', { saveProject })
        ).resolves.toBeUndefined();

        expect(saveProject).not.toHaveBeenCalled();
    });
});
