/**
 * The Console identity block an App Management app's install and uninstall
 * calls send (`appData`): which org, project and workspace the app belongs to.
 *
 * @module features/app-builder/services/appManagementAppData
 */

import type { AppData } from './appManagementClient';
import type { Project } from '@/types/base';

/**
 * The Console identity block the install API requires — every field from the
 * project's persisted `adobe` config, with an error naming the first gap
 * (all fields are optional in the manifest; the spec requires all eight).
 *
 * The WORKSPACE is the component's own when it has one (AB-23): the app is
 * deployed there, so that is the workspace Commerce must be told about. A
 * component added before AB-23 has none recorded and lives in the project's.
 *
 * @param project - the current project
 * @param componentId - the component being installed or uninstalled
 * @returns the appData, or an error naming the missing field
 */
export function buildAppData(project: Project, componentId: string): AppData | { error: string } {
    const adobe = project.adobe ?? {};
    const own = project.appBuilderComponents?.[componentId]?.workspace;
    // Constructed as the declared type, empty-string for absent — then validated
    // — rather than entries + a cast: a cast at this boundary would silence the
    // one checker that can see a missing spec-required field.
    const candidate: AppData = {
        consumerOrgId: adobe.organization ?? '',
        orgName: adobe.organizationName ?? '',
        projectId: adobe.projectId ?? '',
        projectName: adobe.projectName ?? '',
        projectTitle: adobe.projectTitle ?? adobe.projectName ?? '',
        workspaceId: own ? own.id : (adobe.workspace ?? ''),
        workspaceName: own ? own.name : (adobe.workspaceName ?? ''),
        workspaceTitle: own ? (own.title ?? own.name) : (adobe.workspaceTitle ?? adobe.workspaceName ?? ''),
    };
    const missing = Object.entries(candidate).find(([, value]) => value === '');
    if (missing) {
        return { error: `The project's Adobe context is missing ${missing[0]}.` };
    }
    return candidate;
}
