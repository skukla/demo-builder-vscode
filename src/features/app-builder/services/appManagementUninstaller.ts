/**
 * App Management uninstall orchestration — the inverse of the installer.
 *
 * Removing an app-management integration with `aio app undeploy` alone removes
 * the ACTIONS but none of what the app's INSTALLER created: ~23 I/O Events
 * registrations, the Runtime binding packages, the Commerce-side eventing
 * configuration, and the app↔Commerce association (all measured live,
 * 2026-08-27 — the residue from half-installs had to be cleared by hand).
 * The app's own API serves the clean path: start its uninstaller, poll it to
 * terminal, then clear the finished record and the association.
 *
 * Mirrors {@link installAppManagementApp}: every input derives from what the
 * project already knows, a failure NEVER blocks the remove that follows (the
 * caller logs and continues — `aio app undeploy` still takes the actions
 * down), and the same 409 self-race signature gets the same retry treatment.
 *
 * @module features/app-builder/services/appManagementUninstaller
 */

import {
    AppManagementApiError,
    AppManagementClient,
    type AppManagementAuth,
    type InstallationState,
} from './appManagementClient';
import {
    APP_MANAGEMENT_HANDS_BACK,
    buildAppData,
    deriveAppManagementBaseUrl,
    deriveCommerceTarget,
    IO_EVENTS_ENV,
    IO_EVENTS_URL,
    isRetryableInstallFailure,
} from './appManagementInstaller';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

/** How often to re-read a queued uninstallation's state. */
const POLL_INTERVAL_MS = 5000;
/** Give a queued uninstallation this long before handing back to the user. */
const POLL_BUDGET_MS = TIMEOUTS.LONG;
/** Uninstall rounds before handing back (same self-race as install). */
const MAX_UNINSTALL_ROUNDS = 5;

/** The subset of {@link AppManagementClient} the uninstaller drives (test seam). */
export type UninstallerClient = Pick<
    AppManagementClient,
    | 'getUninstallationState'
    | 'startUninstallation'
    | 'clearUninstallationState'
    | 'clearAssociation'
>;

export interface AppManagementUninstallResult {
    status: 'uninstalled' | 'skipped' | 'failed';
    /** Human line — the no-op reason on skip, the hands-back on failure. */
    detail?: string;
}

export interface AppManagementUninstallDeps {
    /** Resolve IMS auth for the app's org; undefined = cannot authenticate. */
    getAuth: () => Promise<AppManagementAuth | undefined>;
    logger: Logger;
    onProgress?: (message: string) => void;
    /** Client construction (tests inject a fake; default builds the real one). */
    clientFactory?: (baseUrl: string, auth: AppManagementAuth) => UninstallerClient;
    /** Poll pacing (tests inject an instant resolver). */
    wait?: (ms: number) => Promise<void>;
}

/**
 * True when the uninstall POST's 409 means "nothing installed to remove" —
 * every reason in the spec's closed no-op enum reads that way for an
 * uninstall, and the live API's message-only form counts too (the install
 * side measured "…already completed…"-style bodies with no reason field).
 */
function isNothingToUninstall(error: unknown): boolean {
    return error instanceof AppManagementApiError && error.status === 409;
}

interface PollBudget {
    roundsLeft: number;
}

async function pollUninstallation(
    client: UninstallerClient,
    deps: AppManagementUninstallDeps,
    budget: PollBudget,
): Promise<InstallationState | undefined> {
    const wait = deps.wait ?? sleep;
    while (budget.roundsLeft > 0) {
        budget.roundsLeft--;
        await wait(POLL_INTERVAL_MS);
        const state = await client.getUninstallationState();
        if (state && state.status !== 'in-progress') {
            return state;
        }
        deps.onProgress?.('Removing the app from Commerce…');
    }
    return undefined;
}

/** Best-effort trailing cleanup: clear the finished record + the association. */
async function clearRecords(client: UninstallerClient, logger: Logger): Promise<void> {
    for (const [label, call] of [
        ['uninstallation record', (): Promise<void> => client.clearUninstallationState()],
        ['association', (): Promise<void> => client.clearAssociation()],
    ] as const) {
        try {
            await call();
        } catch (error) {
            // The uninstall itself SUCCEEDED — a leftover record does not
            // change that, and the whole workspace is usually torn down next.
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`[AppManagement] could not clear the ${label}: ${message}`);
        }
    }
}

/**
 * Uninstall an app-management app from its Commerce instance via the app's own
 * API. Never throws — the caller (integration remove) proceeds to
 * `aio app undeploy` whatever this returns.
 *
 * @param project - the current project (Commerce config + Adobe context)
 * @param deployedUrls - the app's persisted per-action URL map
 * @param deps - auth, logging, progress, and the test seams
 * @returns the outcome — uninstalled / skipped (nothing installed) / failed
 */
export async function uninstallAppManagementApp(
    project: Project,
    deployedUrls: Record<string, string> | undefined,
    deps: AppManagementUninstallDeps,
): Promise<AppManagementUninstallResult> {
    const fail = (detail: string): AppManagementUninstallResult => ({
        status: 'failed',
        detail: `${detail} ${APP_MANAGEMENT_HANDS_BACK}`,
    });

    const baseUrl = deriveAppManagementBaseUrl(deployedUrls);
    if (!baseUrl) {
        // Never deployed (or predates URL persistence): nothing installed.
        return { status: 'skipped', detail: 'The app exposes no App Management API.' };
    }
    const target = deriveCommerceTarget(project);
    if ('error' in target) {
        return fail(target.error);
    }
    const appData = buildAppData(project);
    if ('error' in appData) {
        return fail(appData.error);
    }
    const auth = await deps.getAuth();
    if (!auth) {
        return fail('No Adobe sign-in is available to authenticate the uninstall call.');
    }

    const factory =
        deps.clientFactory ??
        ((url: string, clientAuth: AppManagementAuth) => new AppManagementClient(url, clientAuth));
    const client = factory(baseUrl, auth);

    try {
        const budget: PollBudget = { roundsLeft: Math.ceil(POLL_BUDGET_MS / POLL_INTERVAL_MS) };
        for (let round = 1; round <= MAX_UNINSTALL_ROUNDS; round++) {
            deps.onProgress?.(
                round === 1
                    ? 'Removing the app from Commerce…'
                    : `Retrying the uninstall (transient conflict, round ${round})…`,
            );
            const started = await client.startUninstallation({
                appData,
                ioEventsUrl: IO_EVENTS_URL,
                ioEventsEnv: IO_EVENTS_ENV,
                commerceBaseUrl: target.commerceBaseUrl,
                commerceEnv: target.commerceEnv,
            });
            // A 200 answered synchronously; a 202 queued the work — poll it.
            const finalState = started.id
                ? await pollUninstallation(client, deps, budget)
                : undefined;
            if (started.id && !finalState) {
                return fail('The uninstall is still running.');
            }
            if (finalState?.status === 'failed') {
                if (isRetryableInstallFailure(finalState)) {
                    continue;
                }
                return fail("The app's uninstaller reported a failure.");
            }
            await clearRecords(client, deps.logger);
            return { status: 'uninstalled' };
        }
        return fail('The uninstall kept hitting a transient conflict.');
    } catch (error) {
        if (isNothingToUninstall(error)) {
            return { status: 'skipped', detail: 'Nothing is installed in Commerce.' };
        }
        const message = error instanceof Error ? error.message : String(error);
        deps.logger.warn(`[AppManagement] uninstall failed: ${message}`);
        return fail(`The uninstall call failed (${message}).`);
    }
}
