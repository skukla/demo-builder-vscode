/**
 * Syncing a storefront with its upstream template — the safety net, not the plumbing.
 *
 * DONE CRITERION, written BEFORE the work and recorded in
 * `.rptc/plans/architecture-test-convergence/overview.md`:
 *
 *   1. Preserved files survive BOTH strategies (merge and reset).
 *   2. A failure at any git step does NOT push.
 *   3. Conflicts surface rather than resolve silently.
 *   4. Every remaining uncovered line is NAMED in the commit and is shell I/O
 *      or a log — not a decision.
 *
 * WHY THESE. This service pushes to the user's live GitHub repo, and the reset
 * strategy discards local customisations by design. A small set of files —
 * `fstab.yaml`, `config.json` — is meant to survive regardless, via a
 * backup-then-restore pair. That pair IS the safety net for a storefront's
 * configuration, and nothing asserted it held.
 */

const mockExecute = jest.fn();
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();
const mockRm = jest.fn();
const mockMkdtemp = jest.fn();

jest.mock('vscode', () => ({ window: {}, workspace: {} }), { virtual: true });
// The service constructs its own GitHubTokenService (one of the 12 remaining
// construction-ledger rows). That is why this suite has to module-mock it rather
// than hand a fake in — the ledger row's cost, in practice.
jest.mock('@/features/eds/services/github/githubTokenService', () => ({
    GitHubTokenService: class {
        getToken = jest.fn().mockResolvedValue({ token: 'gh-token' });
    },
}));

// The subject now asks the service cache instead of constructing its own token
// service. This delegates to the SAME mocked class above, so the suite's
// behaviour is unchanged — only the route to it is.
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: jest.fn(() => {
        const { GitHubTokenService } = jest.requireMock(
            '@/features/eds/services/github/githubTokenService',
        );
        return { tokenService: new GitHubTokenService() };
    }),
}));
jest.mock('fs/promises', () => ({
    readFile: (...a: unknown[]) => mockReadFile(...a),
    writeFile: (...a: unknown[]) => mockWriteFile(...a),
    mkdir: (...a: unknown[]) => mockMkdir(...a),
    rm: (...a: unknown[]) => mockRm(...a),
    mkdtemp: (...a: unknown[]) => mockMkdtemp(...a),
}));

import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import { createMockProject } from '../../../helpers/projectFake';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

/** An EDS project with the metadata the service reads. */
function edsProject(): Project {
    return createMockProject({
        name: 'demo',
        path: '/projects/demo',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: {
                    githubRepo: 'skukla/demo-storefront',
                    templateOwner: 'adobe',
                    templateRepo: 'aem-boilerplate-commerce',
                },
            },
        },
    } as Partial<Project>);
}

function service(): TemplateSyncService {
    return new TemplateSyncService(
        { get: jest.fn().mockResolvedValue('gh-token') } as never,
        createMockLogger(),
        createMockCommandExecutor({ execute: (...a: unknown[]) => mockExecute(...a) })
    );
}

/** Every git call succeeds unless a test says otherwise. */
function allGitSucceeds() {
    mockExecute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
}

/** Which git commands actually ran, in order. */
function gitCalls(): string[] {
    return mockExecute.mock.calls.map((c) => String(c[0]));
}

const pushed = () => gitCalls().some((c) => /git push/.test(c));

beforeEach(() => {
    jest.clearAllMocks();
    mockMkdtemp.mockResolvedValue('/tmp/sync-xyz');
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
    // Both preserved files exist and have content worth keeping.
    mockReadFile.mockImplementation(async (p: string) =>
        p.endsWith('fstab.yaml') ? 'MOUNTS' : '{"headers":{}}'
    );
    allGitSucceeds();
});

describe('CRITERION 1 — the preserved files survive both strategies', () => {
    it('CONTROL: the service reaches git at all with this fixture', () => {
        // Without this, every "did not push" assertion below would pass on a
        // service that bailed out before doing anything.
        return service()
            .syncWithTemplate(edsProject(), { strategy: 'merge' })
            .then(() => expect(gitCalls().length).toBeGreaterThan(0));
    });

    it('backs the preserved files up and writes them back — merge', async () => {
        await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        const written = mockWriteFile.mock.calls.map((c) => String(c[0]));
        expect(written.some((p) => p.endsWith('fstab.yaml'))).toBe(true);
        expect(written.some((p) => p.endsWith('config.json'))).toBe(true);
    });

    it('backs the preserved files up and writes them back — reset', async () => {
        // Reset discards local work by design, which is exactly why this pair
        // has to hold: it is all that stands between a sync and a destroyed
        // site configuration.
        await service().syncWithTemplate(edsProject(), { strategy: 'reset' });

        const written = mockWriteFile.mock.calls.map((c) => String(c[0]));
        expect(written.some((p) => p.endsWith('fstab.yaml'))).toBe(true);
        expect(written.some((p) => p.endsWith('config.json'))).toBe(true);
    });

    it('writes back exactly what it read, not a rebuilt version', async () => {
        await service().syncWithTemplate(edsProject(), { strategy: 'reset' });

        const fstab = mockWriteFile.mock.calls.find((c) => String(c[0]).endsWith('fstab.yaml'));
        expect(fstab?.[1]).toBe('MOUNTS');
    });

    it('skips a preserved file that does not exist rather than failing the sync', async () => {
        // A project without a config.json must still sync.
        mockReadFile.mockRejectedValue(Object.assign(new Error('nope'), { code: 'ENOENT' }));

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(result.success).toBe(true);
    });
});

describe('CRITERION 2 — a failed git step never pushes', () => {
    /** Make the Nth matching command fail; everything else succeeds. */
    function failOn(pattern: RegExp) {
        mockExecute.mockImplementation(async (cmd: string) =>
            pattern.test(cmd)
                ? { code: 1, stdout: '', stderr: 'boom' }
                : { code: 0, stdout: '', stderr: '' }
        );
    }

    it('CONTROL: a fully successful sync DOES push', () => {
        // Otherwise every assertion in this block passes trivially.
        return service()
            .syncWithTemplate(edsProject(), { strategy: 'merge' })
            .then(() => expect(pushed()).toBe(true));
    });

    it('does not push when the clone fails', async () => {
        failOn(/git clone/);

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(pushed()).toBe(false);
        expect(result.success).toBe(false);
    });

    it('does not push when the fetch fails', async () => {
        failOn(/git fetch/);

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(pushed()).toBe(false);
        expect(result.success).toBe(false);
    });

    it('reports failure when the push itself fails', async () => {
        // The one case where a push IS attempted — the result must not claim
        // success, or the caller records a sync that never landed.
        failOn(/git push/);

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(result.success).toBe(false);
    });
});

describe('CRITERION 3 — conflicts surface rather than resolving silently', () => {
    /** Make the conflict probe report two conflicted files. */
    function withConflicts() {
        mockExecute.mockImplementation(async (cmd: string) =>
            /diff --name-only --diff-filter=U/.test(cmd)
                ? { code: 0, stdout: 'blocks/hero/hero.js\nstyles/styles.css\n', stderr: '' }
                : { code: 0, stdout: '', stderr: '' },
        );
    }

    it('CONTROL: with no conflicts the result carries none', async () => {
        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });
        expect(result.conflicts ?? []).toEqual([]);
    });

    it('names the conflicted files in the result', async () => {
        withConflicts();

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(result.conflicts).toEqual(['blocks/hero/hero.js', 'styles/styles.css']);
    });

    it('THE BEHAVIOUR WORTH KNOWING: a conflicted merge becomes a RESET', async () => {
        // A user picks "merge" to KEEP their local work. On conflict the service
        // aborts the merge and resets to the template instead — which discards
        // exactly what they were trying to keep. It is flagged after the fact,
        // never asked about beforehand.
        //
        // Pinned rather than judged: changing it is a product decision, and this
        // test is what makes the current behaviour visible to whoever makes it.
        withConflicts();

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(result.fallbackOccurred).toBe(true);
        expect(gitCalls().some((c) => /merge --abort/.test(c))).toBe(true);
    });

    it('the preserved files still survive the fallback reset', async () => {
        // The one guarantee that must hold even when the strategy changes
        // underneath the user.
        withConflicts();

        await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        const written = mockWriteFile.mock.calls.map((c) => String(c[0]));
        expect(written.some((p) => p.endsWith('fstab.yaml'))).toBe(true);
        expect(written.some((p) => p.endsWith('config.json'))).toBe(true);
    });
});
