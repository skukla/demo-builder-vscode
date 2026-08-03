/**
 * Console API handlers — the runtime API-access surface behind the
 * `list_console_apis` / `add_console_apis` MCP tools.
 *
 * Why: a blank-shell App Builder app can't declare its future APIs in the
 * catalog's `requiredApis` (they're unknown at authoring time). When the user
 * later decides "connect Commerce to Firefly", the AI must be able to add API
 * access on the demo workspace credential itself. These handlers close that
 * gap by reusing the ONE subscription implementation (`subscribeRequiredApis`)
 * under the same guard chain as every App Builder mutation (auth →
 * org-mismatch → Developer/System-Admin role).
 *
 * Persistence: runtime-added codes go to `Project.additionalConsoleApis`,
 * which every reconcile call site unions in — the Console subscribe PUTs the
 * full list, so an unpersisted ad-hoc API would be stripped by the next
 * component add/remove.
 *
 * Scope: plain free-service subscriptions. Services needing a product profile
 * (licenseConfigs) fail with the subscriber's error; the tool reports it and
 * points at the Developer Console rather than guessing license shapes.
 */

import { runGuards } from './appBuilderComponentHandlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { buildOrgTargetFromProjectAdobe, withOrgContext } from '@/core/shell';
import { resolveDesiredApis, UNATTRIBUTED_PICKS_KEY } from '@/core/state/componentApiPicks';
import { deriveAllowedDomain } from '@/features/app-builder/services/allowedDomain';
import { fetchApiAccessRows } from '@/features/app-builder/services/apiAccessRows';
import {
    computeRequiredApis,
    subscribeRequiredApis,
} from '@/features/app-builder/services/apiSubscriber';
import { createApiSubscriberClient } from '@/features/app-builder/services/apiSubscriberClientAdapter';
import { subscriberTarget } from '@/features/app-builder/services/appBuilderComponentRunnerDeps';
import { getAvailableAppBuilderComponents } from '@/features/project-creation/services/appBuilderComponentCatalogLoader';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, MessageHandler } from '@/types/handlers';
import { toError } from '@/types/typeGuards';

/** Adobe sdk codes are alphanumeric (e.g. GraphQLServiceSDK); tolerate _ and -. */
const SDK_CODE_RE = /^[A-Za-z0-9_-]+$/;

/** The project's axis-filtered catalog — the same list every reconcile uses. */
function resolveProjectCatalog(project: Project): AppBuilderComponentCatalogEntry[] {
    return getAvailableAppBuilderComponents(
        project.componentSelections?.backend ?? '',
        project.componentSelections?.frontend ?? '',
    );
}

/**
 * Handle 'listConsoleApis' — the org's subscribable Adobe services, each
 * flagged `managed: true` when Demo Builder's reconcile union already covers
 * it (catalog requiredApis + baseline + runtime-added extras).
 */
export const handleListConsoleApis: MessageHandler = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    const orgId = project.adobe?.organization;
    if (!orgId) {
        return {
            success: false,
            error: 'Project has no Adobe org context. Complete Adobe setup first.',
        };
    }

    const guardError = await runGuards(context, project);
    if (guardError) {
        return { success: false, error: guardError.error, code: guardError.code };
    }

    try {
        // `managed` = ALWAYS-ON only (baseline + catalog required, NO extras) — these
        // are locked, non-removable. The optional extras are returned as `added`
        // (checked + removable in the modal). Both survive the noise filter.
        // The union across every integration's picks. Step 04 will make this
        // per-component; today it is the same set the flat field held.
        const added = resolveDesiredApis(project);
        const managed = new Set(computeRequiredApis(resolveProjectCatalog(project), []));
        const rows = await fetchApiAccessRows(
            ServiceLocator.getAuthenticationService(),
            orgId,
            new Set([...managed, ...added]),
        );
        return {
            success: true,
            data: {
                apis: rows.map((row) => ({ ...row, managed: managed.has(row.code) })),
                added,
            },
        };
    } catch (err) {
        return { success: false, error: `Could not list Adobe APIs: ${toError(err).message}` };
    }
};

/** Validate a list of sdk codes; returns an error message or undefined. */
function validateSdkCodes(
    apis: unknown,
    { allowEmpty }: { allowEmpty: boolean },
): string | undefined {
    if (!Array.isArray(apis) || !apis.every((a) => typeof a === 'string')) {
        return 'apis must be an array of Adobe sdk codes';
    }
    if (apis.length === 0 && !allowEmpty) {
        return 'apis must be a non-empty array of Adobe sdk codes';
    }
    const invalid = apis.filter((a) => !SDK_CODE_RE.test(a));
    return invalid.length > 0 ? `Invalid sdk code(s): ${invalid.join(', ')}` : undefined;
}

/**
 * Reconcile the project's OPTIONAL extras to `desiredExtras`: subscribe the full
 * union (baseline + catalog required + desired) and persist `additionalConsoleApis`.
 * Shared by add (union) and set (exact). Because the subscribe PUTs
 * `computeRequiredApis(catalog, desired)`, always-on codes are always re-included
 * and any extra NOT in `desired` is dropped — so a shorter `desired` removes.
 * Persist happens only AFTER a successful subscribe (a failed reconcile must not
 * poison later ones).
 */
async function reconcileExtras(
    context: HandlerContext,
    project: Project,
    desiredExtras: string[],
): Promise<{ success: boolean; error?: string; data?: { subscribed: unknown } }> {
    const authService = ServiceLocator.getAuthenticationService();
    const client = createApiSubscriberClient(authService);
    const orgTarget = buildOrgTargetFromProjectAdobe(
        project.adobe,
        authService.getCachedOrganization(),
    );
    try {
        const subscribed = await withOrgContext(orgTarget, () =>
            subscribeRequiredApis(
                resolveProjectCatalog(project),
                subscriberTarget(project),
                client,
                deriveAllowedDomain(project),
                desiredExtras,
            ),
        );
        // Both forms until the flat write path is retired (step 07). The keyed
        // map is authoritative; the flat field is its union, kept so a manifest
        // written now still loads on an older build.
        project.componentApiPicks = { [UNATTRIBUTED_PICKS_KEY]: desiredExtras };
        project.additionalConsoleApis = desiredExtras;
        await context.stateManager.saveProject(project);
        return { success: true, data: { subscribed } };
    } catch (err) {
        return {
            success: false,
            error:
                `Could not subscribe API(s): ${toError(err).message} — if this service needs a ` +
                'product profile, add it in the Adobe Developer Console (Project → Workspace → Add API).',
        };
    }
}

/**
 * Handle 'addConsoleApis' — additively subscribe the given sdk codes (union with
 * the existing extras). The MCP `add_console_apis` tool path.
 */
export const handleAddConsoleApis: MessageHandler<{ apis?: string[] }> = async (
    context,
    payload,
) => {
    const apis = payload?.apis;
    const codeError = validateSdkCodes(apis, { allowEmpty: false });
    if (codeError) {
        return { success: false, error: codeError, code: ErrorCode.CONFIG_INVALID };
    }

    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    const guardError = await runGuards(context, project);
    if (guardError) {
        return { success: false, error: guardError.error, code: guardError.code };
    }

    const merged = [...new Set([...resolveDesiredApis(project), ...(apis as string[])])];
    const result = await reconcileExtras(context, project, merged);
    if (result.success) {
        context.logger.info(
            `[Console APIs] Added ${(apis as string[]).join(', ')} (union now ${merged.length} extras)`,
        );
    }
    return result;
};

/**
 * Handle 'setConsoleApis' — set the OPTIONAL extras to EXACTLY the given list
 * (empty allowed). Adds and REMOVES: anything dropped from the list is
 * unsubscribed on the next reconcile PUT. The dashboard Manage-APIs path.
 * Always-on codes (baseline + catalog required) can't be removed — the subscribe
 * union re-includes them regardless of `apis`.
 */
export const handleSetConsoleApis: MessageHandler<{ apis?: string[] }> = async (
    context,
    payload,
) => {
    const apis = payload?.apis;
    const codeError = validateSdkCodes(apis, { allowEmpty: true });
    if (codeError) {
        return { success: false, error: codeError, code: ErrorCode.CONFIG_INVALID };
    }

    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }
    const guardError = await runGuards(context, project);
    if (guardError) {
        return { success: false, error: guardError.error, code: guardError.code };
    }

    const desired = [...new Set(apis as string[])];
    const result = await reconcileExtras(context, project, desired);
    if (result.success) {
        context.logger.info(
            `[Console APIs] Set extras to ${desired.length}: ${desired.join(', ')}`,
        );
    }
    return result;
};
