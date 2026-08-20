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

    it('collapses a pending reset too — it is another way of not knowing yet', () => {
        expect(
            resolveCodeSyncView({ isChecking: false, isInstalled: false }, false, true).kind
        ).toBe('cannot-verify');
    });

    it('never lets a pending reset outrank a real answer', () => {
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
