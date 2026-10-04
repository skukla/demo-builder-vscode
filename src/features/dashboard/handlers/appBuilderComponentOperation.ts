/**
 * What every per-component operation shares: resolving its target, the result
 * shape a guard can block, the progress telegraph it runs inside, how it answers
 * with warnings, and the toolchain-refresh consent.
 *
 * Split from `appBuilderComponentHandlers.ts` (EDS-8, 2026-10-04), which still
 * re-exports the public names, so importers keep working.
 *
 * @module features/dashboard/handlers/appBuilderComponentOperation
 */

import * as vscode from 'vscode';
import { postRowStatus } from './appBuilderComponentPush';
import { stageLine } from '@/core/utils/stageLine';
import { cardInFlightLabel, timedSteps } from '@/core/vscode/progressRegister';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import type { RuntimeCleanupSummary } from '@/features/app-builder/services/appBuilderComponentRunner';
import type { CommerceDetachResult } from '@/features/app-builder/services/erpDetach';
import type { Project, AppBuilderComponentKind } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';
import type { OperationPosition } from '@/types/webviewPayloads';

/**
 * Build the toolchain-refresh consent for this invocation (PL-6 bridge).
 *
 * With a webview panel the answer comes from the factory's notification
 * prompt (return undefined → the default applies). Headless — the MCP agent
 * surface, where `context.panel` is absent — the answer IS the request's
 * `refreshCli` flag: an agent is told by the failure hint to confirm with its
 * human and re-call with the flag, so a handler never parks it on a dialog.
 * Exported for its own test.
 */
export function buildToolchainConsent(
    context: HandlerContext,
    refreshCli: boolean | undefined,
): (() => Promise<boolean>) | undefined {
    if (context.panel) return undefined; // interactive: the factory prompt decides
    return async () => refreshCli === true;
}

/**
 * Resolve the two things every per-component handler needs first: a non-empty
 * `id` from the payload, and the current project.
 *
 * Returns a discriminated result rather than throwing: these are `MessageHandler`s
 * that answer with a `HandlerResponse`, so a throw would need a catch at every
 * site or a change to the handler contract. `if (!target.ok) return target.error;`
 * keeps the early-return style the handlers already use.
 *
 * Extracted at four identical copies (duplication scan, 2026-07-31).
 *
 * @param context - the handler context (supplies the state manager)
 * @param id - the payload's component id, possibly absent
 * @returns the id + project, or the error response to return as-is
 */
export async function resolveComponentTarget(
    context: HandlerContext,
    id: string | undefined,
): Promise<{ ok: true; id: string; project: Project } | { ok: false; error: HandlerResponse }> {
    if (!id) {
        return {
            ok: false,
            error: {
                success: false,
                error: 'AppBuilderComponent id is required',
                code: ErrorCode.CONFIG_INVALID,
            },
        };
    }
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return {
            ok: false,
            error: { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND },
        };
    }
    return { ok: true, id, project };
}

/**
 * A runner outcome, plus the one distinction the runner itself cannot make:
 * `blocked` means a GUARD stopped the operation before any work ran, so callers
 * must not take the failed-op path (error row status + snapshot) — nothing was
 * attempted and nothing persisted.
 */
export type GuardableResult = {
    success: boolean;
    error?: string;
    /** Set when the refusal is actionable (AUTH_REQUIRED → the UI offers sign-in). */
    code?: ErrorCode;
    blocked?: boolean;
    /**
     * Set by `removeAppBuilderComponent` — what the Runtime namespace looked like
     * after undeploy. THIS TYPE OMITTED IT UNTIL 2026-09-10, which is how AB-7's
     * fix came to be invisible: the runner produced the summary, this type erased
     * it on the way through `withComponentProgress`, and the handler answered a
     * bare success. A `failed` entry here means code is STILL DEPLOYED.
     */
    runtimeCleanup?: RuntimeCleanupSummary;
    /** Set by `removeAppBuilderComponent` for the ERP integration: its Commerce writes undone. */
    commerceDetach?: CommerceDetachResult;
    /**
     * What the operation could not finish, in plain words: a removal's leftovers,
     * or an add's/deploy's storefront republish whose CDN publish did not land.
     */
    warnings?: string[];
    /** Set by `removeAppBuilderComponent`: the Adobe workspaces it deleted. */
    workspacesDeleted?: string[];
};

/**
 * Answer a finished operation, carrying its warnings to BOTH surfaces: a warning
 * notification for the SC, and `data.warning` for an agent, which cannot see a
 * toast. HandlerResponse already has `data?: unknown`, so the message contract
 * does not change. The durable signal is elsewhere — a republish that did not
 * land leaves the storefront stale, so the Republish tile stays amber after the
 * toast is gone (`storefrontRepublishService`).
 */
export function answerWithWarnings(
    data: Record<string, unknown>,
    warnings: (string | undefined)[],
): HandlerResponse {
    const present = warnings.filter((warning): warning is string => Boolean(warning));
    if (present.length > 0) {
        const warning = present.join(' ');
        vscode.window.showWarningMessage(warning);
        return { success: true, data: { ...data, warning } };
    }
    return { success: true, data: Object.keys(data).length > 0 ? data : undefined };
}

/** What the card calls a component: its kind, title-cased for the status line. */
export function kindNoun(kind: AppBuilderComponentKind | undefined): string {
    if (kind === 'mesh') return 'Mesh';
    if (kind === 'system') return 'System';
    return 'Integration';
}

/**
 * Run a slow per-integration operation with the telegraph the rest of the
 * extension already uses: a VS Code progress notification, a live row status on
 * the grid, and USER-log lines at start and finish.
 *
 * They carry DIFFERENT registers, and that split is the point. The question that
 * produced it was not "why do these two say the same words" — it was **why do we
 * run two notification systems at once, and what is each one worth?** Both used
 * to receive the identical string, which is what made the redundancy visible, but
 * sameness of wording was the symptom rather than the reason to change it.
 *
 * The rule: **no two surfaces narrate the same step.** The NOTIFICATION carries
 * the steps, under a static title naming the operation and its object ("Deploying
 * ERP Sync"). The CARD names the operation once ("Deploying…") and holds still.
 *
 * That assignment is reversed from the first attempt at this split, which gave
 * the steps to the card on the theory that the object being acted on should carry
 * them. Seen running (2026-08-04) it was backwards: the card's status line is
 * small, uppercase and inside a ~450px tile, so a two-part step wrapped to two
 * shouting lines in the middle of the object's own summary, while the
 * notification — transient, roomy, and where VS Code users already look for
 * progress — sat on one static line. The notification is also the only feedback
 * for someone who is NOT on the Integrations page, so the detail is wasted
 * anywhere else. A path with no card (the projects-list kebab redeploy) always
 * kept step text in its notification; that is now simply the general rule rather
 * than an exception to one.
 *
 * Before this, add/remove/deploy ran silently — the modal closed, `aio app
 * undeploy` ground away for tens of seconds, and nothing anywhere said so
 * (reported 2026-07-31: "no visual indication that anything is happening", "no
 * logging in the user log channel for any of these actions"). Mirrors
 * `DeployMeshCommand`'s withProgress + status-push shape rather than inventing a
 * second one.
 *
 * **Call this BEFORE the guards, not after.** `runGuards` performs the auth
 * check, whose `aio config get` spawn costs seconds on a cold cache — so a
 * handler that guards first shows nothing for those seconds and the notification
 * reads as laggy (reported 2026-07-31: "it's not as immediate as it should be").
 * Every slow step belongs inside `run`, with
 * `report(OPERATION_STAGES.checkingRequirements.label)` as its first line — the same
 * shape `deployMeshHeadless` uses.
 *
 * **Started from the integrations screen, it narrates to a modal instead**
 * (`progress: 'modal'`, PL-59): each stage, its step and the stage's expectation line
 * go to the SC's modal, and no notification opens — the modal is the one surface
 * narrating the steps. The card still gets its single line.
 *
 * @param options - the notification title, the row to telegraph, the user logger,
 *                  and where the steps go
 * @param run - the work; call its `report` with each stage, and the step under it
 * @returns whatever `run` resolves to
 */
export async function withComponentProgress<T extends GuardableResult>(
    options: {
        title: string;
        id: string;
        label: string;
        /** What the card calls the thing — its KIND ("Mesh" / "Integration"). */
        noun: string;
        logger: HandlerContext['logger'];
        /** `'modal'` when the SC started it from the integrations screen. */
        progress?: 'modal';
    },
    run: (report: (stage: string, step?: string, position?: OperationPosition) => void) => Promise<T>,
): Promise<T> {
    const { title, id, label, noun, logger } = options;
    const inModal = options.progress === 'modal';
    logger.info(`${title} ${label}`);
    // Every step also reaches the Debug Logs with how long the step before it
    // took. The notification shows only the step in flight and is gone when it
    // closes, so an update that stalled left nothing to read (owner, 2026-09-18).
    const steps = timedSteps((line) => logger.debug(`[${title} ${label}] ${line}`));

    // Where it reports is decided in one place for every operation (PL-59 phase 2):
    // the modal when started from a button, else one notification whose message is
    // the stage name, else the agent's notification — and while the modal narrates,
    // nothing run inside the operation opens a notification of its own (R7).
    const result = await withOperationProgress(
        {
            id,
            title: `${title} ${label}`,
            inModal,
            cardLabel: cardInFlightLabel(title, noun),
            pushCardStatus: (cardLabel) => {
                void postRowStatus(id, 'deploying', cardLabel);
            },
        },
        (report) =>
            run((stage, step, position) => {
                steps.step(stageLine(step || stage, position));
                report(stage, step, position);
            }),
    );
    steps.finish();

    if (result.success) {
        logger.info(`${title} ${label} — done`);
    } else if (result.blocked) {
        // A guard stopped it before any work ran — not a failure to report as one.
        logger.info(`${title} ${label} — stopped: ${result.error ?? 'requirements not met'}`);
    } else {
        logger.error(`${title} ${label} — failed: ${result.error ?? 'unknown error'}`);
    }
    return result;
}

