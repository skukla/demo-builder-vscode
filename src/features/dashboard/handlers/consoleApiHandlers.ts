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
import { resolveApiOwners } from '@/core/state/apiOwners';
import { resolveApiRowStates } from '@/core/state/apiRowState';
import { applyDesiredApis, resolveDesiredApis } from '@/core/state/componentApiPicks';
import { deriveAllowedDomain } from '@/features/app-builder/services/allowedDomain';
import { fetchApiAccessRows } from '@/features/app-builder/services/apiAccessRows';
import {
    computeRequiredApis,
    subscribeRequiredApis,
    type SubscribedApi,
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
export const handleListConsoleApis: MessageHandler<{ componentId?: string }> = async (
    context,
    payload,
) => {
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
        const componentId = payload?.componentId;
        const union = resolveDesiredApis(project);
        // Scoped to the asking integration when one asks. A caller with no
        // componentId (the MCP tools, any pre-step-04 surface) still gets the union.
        const added = componentId ? (project.componentApiPicks?.[componentId] ?? []) : union;
        const managed = new Set(computeRequiredApis(resolveProjectCatalog(project), []));
        const rows = await fetchApiAccessRows(
            ServiceLocator.getAuthenticationService(),
            orgId,
            new Set([...managed, ...union]),
        );

        // Attribution: which integration is holding each code, and under what claim.
        // Only meaningful from some integration's point of view, so it is absent
        // entirely for a project-scoped call rather than faked with a placeholder id.
        const states = componentId
            ? resolveApiRowStates({
                  componentId,
                  owners: resolveApiOwners(project),
                  picks: project.componentApiPicks ?? {},
                  baseline: [...managed],
              })
            : undefined;

        return {
            success: true,
            data: {
                apis: rows.map((row) => {
                    const state = states?.get(row.code);
                    return {
                        ...row,
                        managed: managed.has(row.code),
                        ...(state
                            ? { ownership: state.ownership, requiredBy: state.requiredBy }
                            : {}),
                    };
                }),
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
    componentId?: string,
): Promise<{ success: boolean; error?: string; data?: { subscribed?: SubscribedApi[] } }> {
    // Per-integration edit: `desiredExtras` is THIS component's list, not the union.
    // The subscribe still has to send the union, or dropping a code here would
    // unsubscribe it out from under every other integration that holds it — the one
    // failure mode in this plan that damages a live workspace.
    let nextPicks: Record<string, string[]> | undefined;
    if (componentId) {
        const current = { ...(project.componentApiPicks ?? {}) };
        if (desiredExtras.length > 0) {
            current[componentId] = [...new Set(desiredExtras)];
        } else {
            // An owner left with nothing is removed, not kept as an empty key —
            // same rule applyDesiredApis follows, so the two writers agree.
            delete current[componentId];
        }
        nextPicks = current;
        desiredExtras = [...new Set(Object.values(current).flat())];
    }
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
        // Reconciled, not replaced. This edits the UNION, and overwriting the map
        // with a single unattributed bucket erased which integration wanted what —
        // harmless only while nothing attributed picks, which stopped being true
        // when the dashboard Add flow began recording them. The flat
        // additionalConsoleApis write was retired with step 07 (2026-08-23);
        // the keyed map is the one written form.
        project.componentApiPicks = nextPicks ?? applyDesiredApis(project, desiredExtras);
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
export const handleSetConsoleApis: MessageHandler<{ apis?: string[]; componentId?: string }> = async (
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
    const result = await reconcileExtras(context, project, desired, payload?.componentId);
    if (result.success) {
        // Report the OUTCOME, not the request. This line used to print `desired`,
        // so "Set extras to 1: commerceeventing" read identically whether that API
        // was subscribed or merely asked for — the one question it gets asked.
        // `subscribed` is the resolved union a subscribe endpoint actually took.
        const confirmed = result.data?.subscribed ?? [];
        const confirmedCodes = confirmed.map((api) => api.code);
        context.logger.info(
            `[Console APIs] Extras set to ${desired.length} ` +
                `(${desired.join(', ') || 'none'}); subscribed ${confirmedCodes.length}: ` +
                `${confirmedCodes.join(', ') || 'none'}`,
        );

        // A requested code missing from the confirmed set means a subscribe
        // silently skipped it — today that happens when a service lists neither
        // platform, so no PUT covers it. Success is still correct for everything
        // else; this is the part that must not pass unremarked.
        const missing = desired.filter((code) => !confirmedCodes.includes(code));
        if (missing.length > 0) {
            context.logger.warn(
                `[Console APIs] Requested but NOT subscribed: ${missing.join(', ')} — ` +
                    'the service matched no subscribe platform for this org.',
            );
        }
    }
    return result;
};
