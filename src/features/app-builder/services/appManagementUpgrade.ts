/**
 * Upgrades of an installed App Management app (`@adobe/aio-commerce-lib-app` 2.x).
 *
 * A 2.x app upgrades itself when its `metadata.version` changes: `POST
 * /installation` compares the installed version with the deployed one and, in
 * `auto` mode, starts an attempt that adds, changes and removes what the app
 * registered in Commerce. Its generated post-deploy hook asks for that at the
 * end of `aio app deploy`, so by the time Demo Builder asks, an attempt may
 * already be running or finished; a second request while one runs fails.
 * Hence: follow a running attempt first, then ask. An installed 1.x app
 * answers "already completed" instead; the installer treats both as no-ops.
 *
 * Read from the 2.0.0 package (OpenAPI and installation action), 2026-09-17.
 *
 * @module features/app-builder/services/appManagementUpgrade
 */

import {
    AppManagementApiError,
    type AppManagementClient,
    type LifecycleAttempt,
} from './appManagementClient';
import { sleep } from '@/core/utils/sleep';

/** What an install pass did, for the project record and the SC. */
export interface AppManagementInstallResult {
    status: 'installed' | 'upgraded' | 'skipped' | 'failed';
    /** Plain-words line: what happened, or why not. */
    detail?: string;
    /** The app version now installed, when known. */
    version?: string;
    /**
     * The installed app cannot be upgraded in place; uninstalling it (with the
     * deployed version) and installing again would apply the new one.
     */
    needsReinstall?: boolean;
}

/** What the caller knows about the install pass it asks for. */
export interface AppManagementInstallOptions {
    /** The app version being installed (its manifest's `metadata.version`), when known. */
    appVersion?: string;
    /** When the deploy this pass follows started (ISO). */
    since?: string;
}

/** The client calls an upgrade needs (test seam). */
export type UpgradeClient = Pick<AppManagementClient, 'getLatestLifecycleAttempt'>;

/** How often to re-read a running attempt, and for how many reads. */
const ATTEMPT_POLL_MS = 3000;
const ATTEMPT_MAX_READS = 100;

const isActive = (attempt: LifecycleAttempt): boolean =>
    attempt.status === 'pending' || attempt.status === 'in-progress';

/** True for a running upgrade (install attempts are followed by the installer itself). */
export function isRunningUpgrade(
    attempt: LifecycleAttempt | undefined,
): attempt is LifecycleAttempt {
    return attempt !== undefined && attempt.operation === 'upgrade' && isActive(attempt);
}

/**
 * True for an upgrade that finished at or after `since`, i.e. one the deploy
 * this pass follows started.
 */
export function isUpgradeSince(
    attempt: LifecycleAttempt | undefined,
    since: string | undefined,
): attempt is LifecycleAttempt {
    if (!attempt || attempt.operation !== 'upgrade' || attempt.status !== 'succeeded' || !since) {
        return false;
    }
    return Date.parse(attempt.startedAt) >= Date.parse(since);
}

/** A finished attempt, as the install pass reports it. */
export function describeAttempt(attempt: LifecycleAttempt): AppManagementInstallResult {
    if (attempt.status === 'succeeded') {
        const version = attempt.result?.appVersion;
        return {
            status: 'upgraded',
            version,
            detail: version
                ? `Upgraded in Commerce to version ${version}.`
                : 'Upgraded in Commerce.',
        };
    }
    const reason = attempt.failure?.message ?? attempt.failure?.key ?? 'no reason given';
    return { status: 'failed', detail: `The upgrade in Commerce failed: ${reason}.` };
}

/**
 * Follow an upgrade attempt until it finishes, reading the latest attempt.
 *
 * @returns the outcome, or a failure naming that it is still running
 */
export async function followUpgrade(
    client: UpgradeClient,
    onProgress?: (message: string) => void,
    wait: (ms: number) => Promise<void> = sleep,
): Promise<AppManagementInstallResult> {
    for (let read = 0; read < ATTEMPT_MAX_READS; read++) {
        const attempt = await client.getLatestLifecycleAttempt();
        if (!attempt) {
            return { status: 'failed', detail: 'The upgrade in Commerce could not be read back.' };
        }
        if (!isActive(attempt)) {
            return describeAttempt(attempt);
        }
        onProgress?.('Upgrading in Commerce…');
        await wait(ATTEMPT_POLL_MS);
    }
    return { status: 'failed', detail: 'The upgrade in Commerce is still running.' };
}

/** A first-time install that landed. */
export function installedOutcome(version: string | undefined, message?: string): AppManagementInstallResult {
    return {
        status: 'installed',
        version,
        detail: version ? `Installed in Commerce at version ${version}.` : message,
    };
}

/** An upgrade answered with a plan only: the app upgrades manually. */
export function plannedOnly(version: string | undefined): AppManagementInstallResult {
    return {
        status: 'skipped',
        version,
        detail: version
            ? `An upgrade to version ${version} was planned, but this app upgrades manually, so nothing changed in Commerce.`
            : 'An upgrade was planned, but this app upgrades manually, so nothing changed in Commerce.',
    };
}

/**
 * A 409 that means the installed app cannot move to the deployed version in
 * place: an install recorded without its config, or planning blocked by issues.
 */
export function isUpgradeRefusal(error: unknown): boolean {
    if (!(error instanceof AppManagementApiError) || error.status !== 409 || error.reason) {
        return false;
    }
    return /cannot be upgraded safely|upgrade planning is blocked/i.test(error.noOpMessage ?? '');
}

/** The refusal, as the install pass reports it. */
export const REFUSED_UPGRADE: AppManagementInstallResult = {
    status: 'failed',
    needsReinstall: true,
    detail:
        'Commerce cannot upgrade the installed app in place. Reinstalling it (uninstall, then install) applies the new version.',
};

/**
 * "Nothing to do": the upgrade this deploy's post-deploy hook already ran, when
 * there is one since `since`; otherwise the app was already at this version.
 */
export async function settleNoOp(
    client: UpgradeClient,
    appVersion: string | undefined,
    since: string | undefined,
): Promise<AppManagementInstallResult> {
    const latest = await client.getLatestLifecycleAttempt().catch(() => undefined);
    if (isUpgradeSince(latest, since)) {
        return describeAttempt(latest);
    }
    return {
        status: 'skipped',
        version: appVersion,
        detail: appVersion ? `Already installed at version ${appVersion}.` : 'Already installed and current.',
    };
}
