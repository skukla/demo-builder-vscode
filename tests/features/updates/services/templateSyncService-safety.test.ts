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
    BASE_SHA,
    REPO_DIR,
    TEMPLATE_HEAD,
    applyStops,
    edsProject,
    failOn,
    gitCalls,
    mockExecute,
    mockReadFile,
    mockRm,
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

/**
 * A label file the SC's repository does not have stays absent through a replace
 * (EDS-53). Reset and creation remove the template's own label files, because one
 * in the repository hides the DA.live sheet at its path; a replace that read the
 * template's tree back over the checkout would put the B2B template's
 * placeholders/checkout.json back and hide CitiSignal's checkout sheet again.
 */
describe('a replace keeps the label folder as the storefront had it', () => {
    const CHECKOUT = `${REPO_DIR}/placeholders/checkout.json`;

    function withoutCheckoutLabel(): void {
        mockReadFile.mockImplementation(async (p: string) => {
            if (p === CHECKOUT) throw Object.assign(new Error('nope'), { code: 'ENOENT' });
            return p.endsWith('fstab.yaml') ? 'MOUNTS' : '{"headers":{}}';
        });
    }

    it('removes a label file the storefront did not have, after the template tree lands', async () => {
        withoutCheckoutLabel();

        await service().syncWithTemplate(edsProject(), { strategy: 'reset' });

        expect(mockRm).toHaveBeenCalledWith(CHECKOUT, { force: true });
    });

    it('keeps the label files the storefront did have (its stubs), written back as they were', async () => {
        withoutCheckoutLabel();

        await service().syncWithTemplate(edsProject(), { strategy: 'reset' });

        const removed = mockRm.mock.calls.map((c) => String(c[0]));
        expect(removed).not.toContain(`${REPO_DIR}/placeholders/cart.json`);
        expect(mockWriteFile.mock.calls.map((c) => String(c[0]))).toContain(`${REPO_DIR}/placeholders/cart.json`);
    });

    it('removes nothing from a reset that was asked to preserve nothing', async () => {
        withoutCheckoutLabel();

        await service().resetRepository({
            repoOwner: 'skukla',
            repoName: 'demo-storefront',
            templateOwner: 'adobe',
            templateRepo: 'aem-boilerplate-commerce',
        });

        expect(mockRm).not.toHaveBeenCalledWith(CHECKOUT, { force: true });
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

    it('does not push when the recorded version is not a template commit', async () => {
        // The old merge recorded the storefront's OWN head. Diffing from it would
        // replay the whole template over the SC's edits, so it is refused outright.
        failOn(/git merge-base [^-]/);

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(pushed()).toBe(false);
        expect(result.success).toBe(false);
    });

    it('does not push when the 3-way apply fails for a reason other than conflicts', async () => {
        applyStops('');

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(pushed()).toBe(false);
        expect(result.success).toBe(false);
    });

    it('a merge with no recorded version never reaches git', async () => {
        const result = await service().syncWithTemplate(
            edsProject({ lastSyncedCommit: undefined }),
            { strategy: 'merge' },
        );

        expect(mockExecute).not.toHaveBeenCalled();
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
    /** The 3-way apply stops, leaving two files unmerged. */
    function withConflicts() {
        applyStops('blocks/hero/hero.js\nstyles/styles.css\n');
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

    it('a conflicted merge STOPS: restores the clone, pushes nothing, and fails with the file list', async () => {
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
            clash: {
                source: { owner: 'adobe', repo: 'aem-boilerplate-commerce' },
                base: BASE_SHA,
                target: TEMPLATE_HEAD,
                preserveFiles: expect.arrayContaining(['fstab.yaml', 'config.json']),
            },
            error: 'Merge conflicts in 2 files (blocks/hero/hero.js, styles/styles.css); the template update was not applied.',
        });
        expect(gitCalls().some((c) => /reset --hard HEAD/.test(c))).toBe(true);
        expect(gitCalls().some((c) => /read-tree/.test(c))).toBe(false);
        expect(pushed()).toBe(false);
    });

    it('a conflicted merge writes nothing back into the checkout', async () => {
        // Nothing to restore: `reset --hard HEAD` returns the clone to where the
        // backups were taken, and a template reset that would need them never runs.
        withConflicts();

        await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('a single conflicted file is worded in the singular', async () => {
        applyStops('blocks/hero/hero.js\n');

        const result = await service().syncWithTemplate(edsProject(), { strategy: 'merge' });

        expect(result.error).toBe(
            'Merge conflicts in 1 file (blocks/hero/hero.js); the template update was not applied.',
        );
    });
});
