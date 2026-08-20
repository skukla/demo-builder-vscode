/**
 * Acknowledge the install before continuing, when we can only infer it.
 *
 * An existing-repo user whose App is missing could walk past the wizard's
 * install prompt, hit Create, and be halted at Phase 3 — AFTER Phase 1 reset
 * the repo and Phase 2 pushed to it. Moving the Code Sync check earlier
 * (2026-08-06) was meant to stop exactly that, and this was the hole left in it.
 *
 * The gate is a CLICK, not a verification, and the distinction is the point.
 * Our App signal is unreliable in this state by construction: an outer 404 has
 * no `code.status` to read (see `siteUnknownReason`), so "the App is missing" is
 * an inference. Blocking on an inference strands anyone it is wrong about, with
 * no way forward. Requiring the user to open the install page costs them one
 * click and leaves them in control — the same bar `storefront-tools` settled on
 * (`templates.js:786`, Continue disabled until `installLinkClicked`).
 *
 * A DEFINITIVE answer still blocks outright: `codeStatus === 404` means Helix
 * knows the repo and has no code sync for it, which is a measurement, not a
 * guess.
 */

import { computeCodeSyncValid } from '@/features/eds/ui/steps/repoSelectionInline.helpers';

const repo = { id: 'o/r', name: 'r', fullName: 'o/r' } as Parameters<
    typeof computeCodeSyncValid
>[2];

/** Outer 404: Helix does not know the site, so there is no inner status. */
const inferredMissing = {
    isChecking: false,
    isInstalled: false,
    installUrl: 'https://github.com/apps/aem-code-sync',
};

describe('computeCodeSyncValid — install acknowledgement', () => {
    it('holds an existing repo until the install link is opened', () => {
        expect(computeCodeSyncValid('existing', inferredMissing, repo, false)).toBe(false);
    });

    it('lets it through once the user has opened it', () => {
        expect(computeCodeSyncValid('existing', inferredMissing, repo, true)).toBe(true);
    });

    it('still blocks outright on a definitive missing App', () => {
        // Inner 404 is measured, not inferred — a click must not wave it past.
        const definitive = { isChecking: false, isInstalled: false, codeStatus: 404 };

        expect(computeCodeSyncValid('existing', definitive, repo, true)).toBe(false);
    });

    it('does not gate a verified repo', () => {
        const verified = { isChecking: false, isInstalled: true, codeStatus: 200 };

        expect(computeCodeSyncValid('existing', verified, repo, false)).toBe(true);
    });

    it('does not gate when the check could not tell', () => {
        // `undetermined` means AEM refused or was unreachable. Sending someone
        // to install an App over a refused credential is the eleven-reinstalls
        // bug; it must not become a gate either.
        const undetermined = { isChecking: false, isInstalled: false, undetermined: true };

        expect(computeCodeSyncValid('existing', undetermined, repo, false)).toBe(true);
    });

    it('does not change the new-repo path, which gates on real verification', () => {
        expect(computeCodeSyncValid('new', inferredMissing, undefined, false)).toBe(false);
        expect(
            computeCodeSyncValid('new', { isChecking: false, isInstalled: true }, undefined, false)
        ).toBe(true);
    });
});
