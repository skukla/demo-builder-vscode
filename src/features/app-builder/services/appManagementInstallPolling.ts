/**
 * Following an App Management installation that is still running: the poll loop, the
 * one-install poll budget, and the test that tells a call the client gave up waiting on
 * from a call that failed.
 *
 * Split from `appManagementInstaller.ts` on 2026-10-01, when following a timed-out call
 * (not only a queued 202) took the installer past the service size limit. The installer
 * decides WHEN to follow; this module knows HOW, and nothing about reconcile bodies or
 * Commerce targets.
 *
 * @module features/app-builder/services/appManagementInstallPolling
 */

import type { AppManagementClient, InstallationState } from './appManagementClient';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/** How often to re-read a queued (202) installation's state. */
const POLL_INTERVAL_MS = 5000;
/** Give a queued installation this long before handing back to the user. */
const POLL_BUDGET_MS = TIMEOUTS.LONG;

/** What the poll needs from the client (test seam). */
export type PollingClient = Pick<AppManagementClient, 'getInstallationState'>;

/** Poll pacing, injectable for tests. */
export interface PollingDeps {
    wait?: (ms: number) => Promise<void>;
}

/**
 * The poll allowance for ONE WHOLE install — shared across retry rounds, so
 * five racy rounds can never stack five full budgets (audit finding: the
 * per-round budget made the worst case 5 × 3 minutes).
 */
export interface PollBudget {
    roundsLeft: number;
}

export function newPollBudget(): PollBudget {
    return { roundsLeft: Math.ceil(POLL_BUDGET_MS / POLL_INTERVAL_MS) };
}

/**
 * Poll an installation until it lands or the budget runs out.
 *
 * @param client - the app's client
 * @param deps - wait pacing
 * @param budget - the install's shared allowance, decremented here
 * @returns the final state, or undefined when the budget ran out first
 */
export async function pollInstallation(
    client: PollingClient,
    deps: PollingDeps,
    budget: PollBudget,
): Promise<InstallationState | undefined> {
    const wait = deps.wait ?? sleep;
    while (budget.roundsLeft > 0) {
        budget.roundsLeft--;
        await wait(POLL_INTERVAL_MS);
        const state = await client.getInstallationState();
        if (state && state.status !== 'in-progress') {
            return state;
        }
        // No progress line per round: the install's own line ("Installing into
        // Commerce (App Management)…") still describes it, and a new line every
        // five seconds read as a new step each time.
    }
    return undefined;
}

/**
 * A call the client gave up waiting on (`AbortSignal.timeout` in the client): the
 * DOMException named TimeoutError, or Node's abort wording. Not a call that failed.
 */
export function isCallTimeout(error: unknown): boolean {
    const name = (error as { name?: unknown } | null)?.name;
    const message = error instanceof Error ? error.message : String(error);
    return (
        name === 'TimeoutError' || name === 'AbortError' || /aborted due to timeout/iu.test(message)
    );
}
