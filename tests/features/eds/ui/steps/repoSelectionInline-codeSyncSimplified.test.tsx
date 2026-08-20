/**
 * Three answers, not six.
 *
 * This step accumulated a view per diagnosis — verified, unverifiable,
 * pending-reset, needs-install, and two site-reason variants underneath it —
 * each added to explain a case the one before it got wrong. Five mechanisms to
 * describe an answer we mostly do not have.
 *
 * The signal is only definitive in two shapes (`githubAppService` reads the
 * body's `code.status` on an outer 200): sync is working, or Helix knows the
 * repo and has no code sync for it. Everything else — outer 404, refused
 * credential, unreachable service, a repo not yet reset — is the same fact
 * wearing different clothes: WE CANNOT TELL. One message, the install steps,
 * and a way past.
 *
 * What we noticed along the way (wrong branch, not a storefront yet) is worth
 * SAYING, but it is a sentence, not a separate screen.
 */

import { resolveCodeSyncView } from '@/features/eds/ui/steps/repoSelectionInline.helpers';

describe('resolveCodeSyncView — collapsed', () => {
    it('reports an in-flight check', () => {
        expect(resolveCodeSyncView({ isChecking: true, isInstalled: null }, false).kind).toBe(
            'checking'
        );
        expect(resolveCodeSyncView({ isChecking: false, isInstalled: null }, false).kind).toBe(
            'checking'
        );
    });

    it('reports a real verification', () => {
        expect(
            resolveCodeSyncView({ isChecking: false, isInstalled: true, codeStatus: 200 }, false)
                .kind
        ).toBe('verified');
    });

    it('keeps the DEFINITIVE missing app distinct — it is measured, not guessed', () => {
        // Inner 404: Helix knows the repo and reports no code sync for it.
        expect(
            resolveCodeSyncView({ isChecking: false, isInstalled: false, codeStatus: 404 }, false)
                .kind
        ).toBe('needs-install');
    });

    it.each([
        ['an outer 404 with an install offer', { isChecking: false, isInstalled: false, installUrl: 'u' }],
        ['a refused or unreachable check', { isChecking: false, isInstalled: false, undetermined: true }],
        ['no evidence either way', { isChecking: false, isInstalled: false }],
    ])('collapses %s into cannot-verify', (_label, status) => {
        expect(resolveCodeSyncView(status, false).kind).toBe('cannot-verify');
    });

    // Superseded 2026-08-20. A repo with no storefront content was collapsed into
    // cannot-verify as "another way of not knowing yet". It is not the same thing:
    // the others are questions we FAILED to answer, this is one that cannot be
    // asked. `admin.hlx.page/status` reports on the SITE, and a repo with no
    // storefront content has none, so it answers `404 no such site` however AEM
    // Code Sync is configured. Measured on skukla/kukla-bodea: GitHub listed the
    // repo under the installation and the endpoint 404'd anyway, 28 minutes after
    // a code-sync trigger Helix had accepted.
    //
    // Collapsing it sent an install prompt to people who already had it installed
    // -- the eleven-reinstalls failure in gentler wording.
    it('gives a repo that cannot have a site yet its own answer, not a shrug', () => {
        expect(
            resolveCodeSyncView({ isChecking: false, isInstalled: false }, false, true).kind
        ).toBe('after-setup');
    });

    it('says so before it says "checking", since nothing will be asked', () => {
        // The caller does not probe in this state, so `isInstalled` stays null.
        // Ordered after `checking` this renders a spinner that never resolves.
        expect(
            resolveCodeSyncView({ isChecking: false, isInstalled: null }, false, true).kind
        ).toBe('after-setup');
    });

    it('never lets it outrank a real answer', () => {
        expect(
            resolveCodeSyncView({ isChecking: false, isInstalled: true }, false, true).kind
        ).toBe('verified');
        expect(
            resolveCodeSyncView(
                { isChecking: false, isInstalled: false, codeStatus: 404 },
                false,
                true
            ).kind
        ).toBe('needs-install');
    });
});
