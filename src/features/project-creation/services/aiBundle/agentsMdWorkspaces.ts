/**
 * The Adobe workspaces a project's integrations live in, for AGENTS.md (AB-23).
 *
 * Since AB-23 each add deploys into a workspace of its own and a bound pair shares
 * one, so the project's workspace is no longer where every integration is. An agent
 * told only about the project's workspace looks for the ERP in the wrong place.
 * Components with no recorded workspace live in the project's and are not listed.
 *
 * @module features/project-creation/services/aiBundle/agentsMdWorkspaces
 */

import { sanitizeTemplateValue } from '../sanitization';
import type { AppBuilderComponentState, Project } from '@/types/base';

type Workspace = NonNullable<AppBuilderComponentState['workspace']>;

/**
 * One bullet per integration workspace, naming the components in it.
 *
 * @param project - the project
 * @returns the lines, or none when no component has a workspace of its own
 */
export function integrationWorkspaceLines(project: Project): string[] {
    const byWorkspace = new Map<string, { workspace: Workspace; ids: string[] }>();
    for (const [id, state] of Object.entries(project.appBuilderComponents ?? {})) {
        if (!state.workspace) continue;
        const entry = byWorkspace.get(state.workspace.id) ?? { workspace: state.workspace, ids: [] };
        entry.ids.push(id);
        byWorkspace.set(state.workspace.id, entry);
    }
    if (byWorkspace.size === 0) return [];

    const rows = [...byWorkspace.values()].map(({ workspace, ids }) => {
        const title = sanitizeTemplateValue(workspace.title ?? workspace.name).replace(/\s+/g, ' ');
        const components = ids.sort().map((id) => `\`${sanitizeTemplateValue(id)}\``);
        return `  - ${title.trim()} (\`${sanitizeTemplateValue(workspace.name)}\`): ${components.join(', ')}`;
    });
    return [
        '- **Integration workspaces** — each integration below is deployed into, and removed' +
            ' with, its own workspace, not the one above:',
        ...rows,
    ];
}
