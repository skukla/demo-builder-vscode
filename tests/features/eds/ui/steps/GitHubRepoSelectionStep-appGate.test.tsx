/**
 * The Code Sync gate on the repo-selection step.
 *
 * Ported to the beta.124 lineage 2026-08-06 alongside the fix itself, because on this
 * branch `computeCanProceed` was module-private and untested — neutering the gate
 * changed nothing in the suite. Shipping an unverified gate to users is the failure
 * this whole thread has been about.
 *
 * The rule blocks only on a DEFINITIVE answer. AEM returns the same `404 no such site`
 * for repo-does-not-exist, not-a-Helix-site AND App-not-installed (probed directly
 * against admin.hlx.page), so treating "could not tell" as "missing" would strand the
 * users whose credential AEM refuses — the bug class that caused the original deferral
 * of this check to mid-pipeline.
 */

import { computeCanProceed } from '@/features/eds/ui/steps/GitHubRepoSelectionStep';
import type { GitHubRepoItem } from '@/types/webview';

const repo = { id: 'o/r', name: 'r', owner: 'o', fullName: 'o/r' } as GitHubRepoItem;
const created = { isCreated: true, isCreating: false } as never;
const notCreated = { isCreated: false, isCreating: false } as never;

describe('computeCanProceed — existing repos now gate on Code Sync', () => {
    it('blocks when Helix definitively reports the App missing', () => {
        expect(
            computeCanProceed('existing', created, { isChecking: false, isInstalled: false, codeStatus: 404 }, repo, false)
        ).toBe(false);
    });

    it('allows once the App is verified', () => {
        expect(
            computeCanProceed('existing', created, { isChecking: false, isInstalled: true, codeStatus: 200 }, repo, false)
        ).toBe(true);
    });

    it('blocks while the check is still running', () => {
        expect(
            computeCanProceed('existing', created, { isChecking: true, isInstalled: null }, repo, false)
        ).toBe(false);
    });

    it('ALLOWS an undetermined answer rather than stranding the user', () => {
        // No codeStatus = Helix refused the credential or does not know the site.
        // Not the same as "App missing", and no install fixes it.
        expect(
            computeCanProceed('existing', created, { isChecking: false, isInstalled: false }, repo, false)
        ).toBe(true);
    });

    it('still requires a selected repo and a settled list', () => {
        const ok = { isChecking: false, isInstalled: true } as never;
        expect(computeCanProceed('existing', created, ok, undefined, false)).toBe(false);
        expect(computeCanProceed('existing', created, ok, repo, true)).toBe(false);
    });
});

describe('computeCanProceed — the new-repo rule is unchanged', () => {
    it('requires creation AND a verified App', () => {
        expect(
            computeCanProceed('new', created, { isChecking: false, isInstalled: true }, undefined, false)
        ).toBe(true);
        expect(
            computeCanProceed('new', created, { isChecking: false, isInstalled: false }, undefined, false)
        ).toBe(false);
        expect(
            computeCanProceed('new', notCreated, { isChecking: false, isInstalled: true }, undefined, false)
        ).toBe(false);
    });
});
