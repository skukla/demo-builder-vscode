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
import { deriveAllowedDomain } from '@/features/app-builder/services/allowedDomain';
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
import type { MessageHandler } from '@/types/handlers';
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
        return { success: false, error: guardError };
    }

    try {
        const client = createApiSubscriberClient(ServiceLocator.getAuthenticationService());
        const services = await client.getServicesForOrg(orgId);
        const managed = new Set(
            computeRequiredApis(resolveProjectCatalog(project), project.additionalConsoleApis ?? []),
        );
        return {
            success: true,
            data: {
                apis: services.map((s) => ({
                    code: s.code,
                    name: s.name,
                    managed: managed.has(s.code),
                })),
            },
        };
    } catch (err) {
        return { success: false, error: `Could not list Adobe APIs: ${toError(err).message}` };
    }
};

/**
 * Handle 'addConsoleApis' — subscribe the given sdk codes on the demo
 * workspace credential (full-union reconcile) and persist them so later
 * reconciles keep them.
 */
export const handleAddConsoleApis: MessageHandler<{ apis?: string[] }> = async (
    context,
    payload,
) => {
    const apis = payload?.apis;
    if (!Array.isArray(apis) || apis.length === 0 || !apis.every((a) => typeof a === 'string')) {
        return {
            success: false,
            error: 'apis must be a non-empty array of Adobe sdk codes',
            code: ErrorCode.CONFIG_INVALID,
        };
    }
    const invalid = apis.filter((a) => !SDK_CODE_RE.test(a));
    if (invalid.length > 0) {
        return {
            success: false,
            error: `Invalid sdk code(s): ${invalid.join(', ')}`,
            code: ErrorCode.CONFIG_INVALID,
        };
    }

    const project = await context.stateManager.getCurrentProject();
    if (!project) {
        return { success: false, error: 'No project found', code: ErrorCode.PROJECT_NOT_FOUND };
    }

    const guardError = await runGuards(context, project);
    if (guardError) {
        return { success: false, error: guardError };
    }

    const authService = ServiceLocator.getAuthenticationService();
    const client = createApiSubscriberClient(authService);
    const merged = [...new Set([...(project.additionalConsoleApis ?? []), ...apis])];
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
                merged,
            ),
        );

        // Persist AFTER the subscribe succeeds — a failed subscribe must not
        // poison every later reconcile with an unknown/unentitled code.
        project.additionalConsoleApis = merged;
        await context.stateManager.saveProject(project);

        context.logger.info(
            `[Console APIs] Added ${apis.join(', ')} (union now ${merged.length} extras)`,
        );
        return { success: true, data: { subscribed } };
    } catch (err) {
        return {
            success: false,
            error:
                `Could not subscribe API(s): ${toError(err).message} — if this service needs a ` +
                'product profile, add it in the Adobe Developer Console (Project → Workspace → Add API).',
        };
    }
};
