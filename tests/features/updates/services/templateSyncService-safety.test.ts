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

import {
    edsProject,
    failOn,
    gitCalls,
    mockExecute,
    mockReadFile,
    mockWriteFile,
    pushed,
    resetFakes,
    service,
} from './templateSyncService.testUtils';

beforeEach(() => {
    resetFakes();
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
                : { code: 0, stdout: '', stderr: '' }
        );
    }

    it('CONTROL: with no conflicts the result carries none', async () => {
        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });
        expect(result.conflicts ?? []).toStrictEqual([]);
    });

    it('names the conflicted files in the result', async () => {
        withConflicts();

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(result.conflicts).toEqual(['blocks/hero/hero.js', 'styles/styles.css']);
    });

    it('a conflicted merge STOPS: aborts, pushes nothing, and fails with the file list', async () => {
        // A user picks "merge" to KEEP their local work. A conflict is exactly
        // the case where they edited the region the template changed, so the
        // service backs out and leaves the decision to them. Until 2026-09-14
        // this path reset the repo instead and flagged it after the fact
        // (backlog EDS-14) — which discarded precisely what they were keeping.
        withConflicts();

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(result).toEqual({
            success: false,
            strategy: 'merge',
            syncedCommit: '',
            conflicts: ['blocks/hero/hero.js', 'styles/styles.css'],
            error: 'Merge conflicts in 2 files (blocks/hero/hero.js, styles/styles.css); the template update was not applied.',
        });
        expect(gitCalls().some((c) => /merge --abort/.test(c))).toBe(true);
        expect(gitCalls().some((c) => /read-tree/.test(c))).toBe(false);
        expect(pushed()).toBe(false);
    });

    it('a conflicted merge writes nothing back into the checkout', async () => {
        // Nothing to restore: the abort returns the tree to where the backups
        // were taken, and a reset that would need them never runs.
        withConflicts();

        await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('a single conflicted file is worded in the singular', async () => {
        mockExecute.mockImplementation(async (cmd: string) =>
            /diff --name-only --diff-filter=U/.test(cmd)
                ? { code: 0, stdout: 'blocks/hero/hero.js\n', stderr: '' }
                : { code: 0, stdout: '', stderr: '' }
        );

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(result.error).toBe(
            'Merge conflicts in 1 file (blocks/hero/hero.js); the template update was not applied.',
        );
    });
});
