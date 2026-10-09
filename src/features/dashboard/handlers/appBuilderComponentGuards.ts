/**
 * The guard chain every App Builder component operation opens with:
 * auth → org-mismatch → App Builder permission.
 *
 * Split from `appBuilderComponentHandlers.ts` (EDS-8, 2026-10-04), which still
 * re-exports what it exports, so every importer and every `jest.mock` of that
 * path keeps working.
 *
 * @module features/dashboard/handlers/appBuilderComponentGuards
 */

import * as vscode from 'vscode';
import { withComponentProgress, type GuardableResult } from './appBuilderComponentOperation';
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { OrgAwareAuthManager } from '@/features/authentication/services/detectProjectOrgMismatch';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';
import type { OperationPosition } from '@/types/webviewPayloads';

/**
 * Run the deploy guard order (auth → org-mismatch → App Builder permission).
 * Returns an error string on the first failure (caller aborts
 * WITHOUT calling the runner); undefined when all guards pass.
 *
 * Exported for the console-API handlers (consoleApiHandlers.ts), which need
 * the identical chain before touching Developer Console credentials.
 */
/** A guard refusal: the message to show, plus a code when the UI can act on it. */
export interface GuardFailure {
    error: string;
    /** AUTH_REQUIRED lets a picker offer "Sign In with Adobe" instead of Retry. */
    code?: ErrorCode;
}

/**
 * The guard step every per-component operation opens with: report the check,
 * run the chain, and on a refusal surface the warning and build the `blocked`
 * result — `blocked`, not merely failed, because nothing ran, so callers must
 * NOT take the failed-op path (error row status + snapshot).
 *
 * Returns undefined when all guards pass. One home for what was the same
 * four-line block in add/deploy/remove/install (2026-08-27 sweep — the fourth
 * copy is what tripped Rule of Three).
 */
export async function guardOrBlock(
    context: HandlerContext,
    project: Project,
    report: (message: string) => void,
    progress?: 'modal',
): Promise<GuardableResult | undefined> {
    report(OPERATION_STAGES.checkingRequirements.label);
    const guardError = await runGuards(context, project);
    if (!guardError) {
        return undefined;
    }
    // A modal-hosted operation shows the refusal in its modal; a warning as well
    // would be a second surface saying the same thing.
    if (progress !== 'modal') vscode.window.showWarningMessage(guardError.error);
    return {
        success: false,
        error: guardError.error,
        code: guardError.code,
        blocked: true,
    };
}

/**
 * The chain's org step on its own: a refusal when the project's Adobe org is not
 * the one the signed-in token reaches; undefined when it is, or when the check
 * cannot tell (not signed in — the auth step owns that case).
 *
 * Exported for the extension's update check (AB-73), which asks this one step
 * while LISTING every project's integration updates: the full chain would ask
 * for a sign-in and a role check per project before the SC chose anything.
 *
 * @param context - the handler context (its logger)
 * @param project - the project whose org is checked
 * @param authManager - the signed-in session the token comes from
 */
export async function orgGuard(
    context: HandlerContext,
    project: Project,
    authManager: OrgAwareAuthManager,
): Promise<GuardFailure | undefined> {
    const { detectProjectOrgMismatch } = await import(
        '@/features/authentication/services/detectProjectOrgMismatch'
    );
    const orgContext = await detectProjectOrgMismatch(authManager, project, context.logger);
    if (orgContext && !orgContext.reachable) {
        return {
            error: 'Project uses a different Adobe organization. Use "Switch IMS Org" to continue.',
        };
    }
    return undefined;
}

export async function runGuards(
    context: HandlerContext,
    project: Project,
): Promise<GuardFailure | undefined> {
    const authManager = ServiceLocator.getAuthenticationService();

    // Per-step debug lines: a live deploy sat at "Checking requirements…" for
    // 9+ minutes (2026-08-27) and NOTHING here said which guard was holding it
    // — the same silent-multi-step shape as the teardown (AI-5). Each step
    // names itself BEFORE it runs so the last line in the log is the culprit.
    context.logger.debug('[Guards] 1/3 auth check');
    const authResult = await ensureAdobeIOAuth({
        authManager,
        logger: context.logger,
        logPrefix: '[AppBuilderComponents]',
        projectContext: {
            organization: project.adobe?.organization,
            projectId: project.adobe?.projectId,
            workspace: project.adobe?.workspace,
        },
        // Every App Builder operation passes this guard, reads included — so it names
        // what is needed, not an action ("to manage…" read wrong for a list).
        warningMessage: 'Sign in to Adobe to continue.',
    });
    if (!authResult.authenticated) {
        // TYPED so UI surfaces can offer a SIGN-IN action; a Retry cannot fix this.
        return { error: 'Adobe sign-in required.', code: ErrorCode.AUTH_REQUIRED };
    }

    context.logger.debug('[Guards] 2/3 org-mismatch check');
    const orgRefusal = await orgGuard(context, project, authManager);
    if (orgRefusal) {
        return orgRefusal;
    }

    context.logger.debug('[Guards] 3/3 developer-permission check');
    const permission = await authManager.testDeveloperPermissions();
    if (!permission.hasPermissions) {
        return {
            error: permission.error || 'Developer or System Admin role required for App Builder.',
        };
    }

    context.logger.debug('[Guards] all passed');
    return undefined;
}

/**
 * Run a per-component operation inside its progress, with the guard chain as its
 * first step. The guards run INSIDE the progress because the auth check spawns
 * `aio config get`, which costs seconds on a cold cache — guarding first left the
 * SC staring at nothing. A refusal answers `blocked` and `work` never runs.
 *
 * One home for the opening add, deploy and remove each wrote out in full
 * (EDS-8, 2026-10-04: the split put two copies in separate files and the
 * duplication scan saw them).
 *
 * @param context - the handler context (guards and the user logger)
 * @param project - the project the guards check
 * @param options - the progress title, row id, label, card noun and surface
 * @param work - the operation, handed the stage reporter
 */
export function withGuardedComponentProgress(
    context: HandlerContext,
    project: Project,
    options: { title: string; id: string; label: string; noun: string; progress?: 'modal' },
    work: (
        report: (stage: string, step?: string, position?: OperationPosition) => void,
    ) => Promise<GuardableResult>,
): Promise<GuardableResult> {
    return withComponentProgress(
        { ...options, logger: context.logger },
        async (report): Promise<GuardableResult> => {
            const refused = await guardOrBlock(context, project, report, options.progress);
            if (refused) {
                return refused;
            }
            return work(report);
        },
    );
}
