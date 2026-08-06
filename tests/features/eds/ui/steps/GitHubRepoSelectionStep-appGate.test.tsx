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

import {
    buildAppStatusFromResult,
    computeCanProceed,
} from '@/features/eds/ui/steps/GitHubRepoSelectionStep';
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

/**
 * SPIKE, 2026-08-06 — the question the research left open.
 *
 * "Whether a fresh repo WITH the App installed but not yet synced returns 404 or 200
 * from the status endpoint. Determines whether step 1 needs a short retry."
 *
 * Probed admin.hlx.page directly: a 404 comes back with an EMPTY BODY — no JSON, so no
 * `code.status` at all. Verified against adobe-commerce/boilerplate-b2b-template and
 * skukla/eds-demo-patches, both real repos that are not Helix sites.
 *
 * That answers it. The gate blocks on `codeStatus === 404`, which a bodyless 404 can
 * never produce, so a not-yet-indexed repo resolves to UNDETERMINED and the user
 * proceeds. No retry needed — the design already tolerates the case the research
 * worried about.
 *
 * These assert the whole chain (handler response shape → buildAppStatusFromResult →
 * computeCanProceed) rather than any single hop, because the reasoning spans three
 * files and the risk is a mismatch between them.
 */
describe('SPIKE: a repo Helix has not indexed does not block the user', () => {
    it('a bodyless Helix 404 carries no code.status, so it reads as undetermined', () => {
        // Exactly what githubAppService returns for HTTP 404 (no code.status field).
        const fromHandler = { success: true, isInstalled: false, codeStatus: undefined };

        const status = buildAppStatusFromResult(fromHandler as never);

        expect(status.codeStatus).toBeUndefined();
        expect(computeCanProceed('existing', created, status, repo, false)).toBe(true);
    });

    it('but a KNOWN site whose repo lacks the App does block', () => {
        // Helix answers 200 with code.status 404 — it knows the site and cannot read
        // the code. That is the definitive signal, and the only one worth blocking on.
        const fromHandler = { success: true, isInstalled: false, codeStatus: 404 };

        const status = buildAppStatusFromResult(fromHandler as never);

        expect(computeCanProceed('existing', created, status, repo, false)).toBe(false);
    });

    it('a failed check does not block either', () => {
        // success:false → isInstalled false, codeStatus undefined. Same reasoning: a
        // check we could not complete is not evidence the App is missing.
        const status = buildAppStatusFromResult({ success: false, error: 'network' } as never);

        expect(computeCanProceed('existing', created, status, repo, false)).toBe(true);
    });
});
