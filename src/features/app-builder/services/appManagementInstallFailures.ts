/**
 * Which failed App Management installs retrying can clear, and how.
 *
 * Two measured signatures, each with its own treatment: the installer racing itself on a
 * Runtime package (retry at once) and a workspace credential Adobe has not yet activated
 * (retry after a pause). Split from `appManagementInstaller` to keep that file within its
 * size limit; the uninstaller shares the first.
 *
 * @module features/app-builder/services/appManagementInstallFailures
 */

import type { InstallationState } from './appManagementClient';

/**
 * Failure signatures that mean "run the reconcile again", not "broken".
 *
 * The measured one: the installer creates its I/O Events registrations
 * concurrently and races itself on the Runtime binding package —
 * "HTTP 409 Conflict — Error 409 from upstream (…/runtime/namespaces/…/
 * packages?update=true)". Reconcile is idempotent desired-state, and retries
 * CONVERGE: measured live 2026-08-27, registrations climbed 6 → 8 → 19 → 23
 * across rounds and the fourth landed `succeeded` with every step green.
 */
const RETRYABLE_INSTALL_PATTERNS: readonly RegExp[] = [/HTTP 409 Conflict/];

/**
 * Does this landed-failed state carry a signature retrying can clear?
 * Exported for the uninstaller, whose runs hit the same self-race — the
 * uninstall deletes the registrations the install raced on creating.
 */
export function isRetryableInstallFailure(state: InstallationState): boolean {
    let text: string;
    try {
        text = JSON.stringify(state.error ?? '');
    } catch {
        return false;
    }
    return RETRYABLE_INSTALL_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * The failure a brand-new workspace credential produces before Adobe has activated it.
 *
 * Measured live 2026-09-26 on a fresh add: Commerce's eventing step answered "Event metadata
 * creation error: Could not login to Adobe IMS" minutes after the credential was created,
 * three immediate retries failed the same way, and the same install succeeded 20 minutes
 * later. So this is retried after pauses, not immediately. Kept apart from
 * `isRetryableInstallFailure`, which the uninstaller shares and retries at once.
 */
const CREDENTIAL_NOT_READY_PATTERN = /Could not login to Adobe IMS/;

/** The pauses before each retry of {@link CREDENTIAL_NOT_READY_PATTERN}, longest last. */
export const CREDENTIAL_ACTIVATION_WAITS_MS: readonly number[] = [30_000, 60_000, 120_000];

/** Does this landed-failed state carry the not-yet-activated credential signature? */
export function isCredentialNotReadyFailure(state: InstallationState): boolean {
    try {
        return CREDENTIAL_NOT_READY_PATTERN.test(JSON.stringify(state.error ?? ''));
    } catch {
        return false;
    }
}
