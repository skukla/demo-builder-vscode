/**
 * Shared types and helpers for the update command pipeline.
 *
 * Contains QuickPick item interfaces, the discriminated union, and
 * pure helper functions used by both the command and the executor.
 */

import * as vscode from 'vscode';
import { COMPONENT_IDS } from '@/core/constants';
import type { TemplateUpdateResult } from '@/features/updates/services/templateUpdateChecker';
import type { MultiProjectUpdateResult } from '@/features/updates/services/updateManager';
import type { Project } from '@/types';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';

// ---------------------------------------------------------------------------
// QuickPick item interfaces
// ---------------------------------------------------------------------------

export interface ProjectUpdateItem extends vscode.QuickPickItem {
    project: Project;
    componentId: string;
    currentVersion: string;
    latestVersion: string;
    releaseInfo: MultiProjectUpdateResult['releaseInfo'];
    isProjectUpdate: true;
}

export interface TemplateUpdateItem extends vscode.QuickPickItem {
    project: Project;
    templateUpdate: TemplateUpdateResult;
    isTemplateUpdate: true;
}

export interface ForkSyncItem extends vscode.QuickPickItem {
    owner: string;
    repo: string;
    branch: string;
    behindBy: number;
    parentFullName: string;
    isForkSync: true;
}

export interface BlockLibraryUpdateItem extends vscode.QuickPickItem {
    project: Project;
    library: InstalledBlockLibrary;
    latestCommit: string;
    commitsBehind: number;
    isBlockLibraryUpdate: true;
}

export interface InspectorUpdateItem extends vscode.QuickPickItem {
    project: Project;
    latestCommit: string;
    commitsBehind: number;
    isInspectorUpdate: true;
}

/** Union of all QuickPick item types */
export type UpdateItem =
    | ProjectUpdateItem
    | TemplateUpdateItem
    | ForkSyncItem
    | BlockLibraryUpdateItem
    | InspectorUpdateItem;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Format a "N commits behind" / "update available" label. */
export function formatBehindLabel(count: number): string {
    if (count <= 0) return 'update available';
    return `${count} commit${count !== 1 ? 's' : ''} behind`;
}

/**
 * Extract template source owner/repo from a project's EDS storefront metadata.
 * Returns null if the project has no EDS component or metadata.
 */
export function getTemplateSource(project: Project): { owner: string; repo: string } | null {
    const edsMetadata = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]
        ?.metadata as Record<string, unknown> | undefined;
    const owner = edsMetadata?.templateOwner as string | undefined;
    const repo = edsMetadata?.templateRepo as string | undefined;
    if (!owner || !repo) return null;
    return { owner, repo };
}

/**
 * Determine if a block library update should be skipped because the
 * template sync already covered the same source repository.
 */
export function shouldSkipBlockLibrary(
    library: InstalledBlockLibrary,
    project: Project,
    templateSyncSucceeded: Set<string>,
): boolean {
    if (!templateSyncSucceeded.has(project.path)) return false;
    const source = getTemplateSource(project);
    if (!source) return false;
    return library.source.owner === source.owner && library.source.repo === source.repo;
}

// ---------------------------------------------------------------------------
// QuickPick item builder
// ---------------------------------------------------------------------------

/**
 * Build all QuickPick items and a summary title from the raw update results.
 * Pure function — no side effects, no VS Code API calls.
 */
export function buildUpdatePickerItems(
    componentUpdates: MultiProjectUpdateResult[],
    templateUpdates: Array<{ project: Project; update: TemplateUpdateResult }>,
    forkSyncItems: ForkSyncItem[],
    blockLibraryItems: BlockLibraryUpdateItem[],
    inspectorItems: InspectorUpdateItem[],
    currentProject: Project | null,
): { items: UpdateItem[]; title: string } {
    // Single map: group components and templates by project
    const projectMap = new Map<string, {
        project: Project;
        components: Array<{
            componentId: string;
            currentVersion: string;
            latestVersion: string;
            releaseInfo: MultiProjectUpdateResult['releaseInfo'];
        }>;
        templateUpdate?: TemplateUpdateResult;
    }>();

    for (const update of componentUpdates) {
        for (const { project, currentVersion } of update.outdatedProjects) {
            if (!projectMap.has(project.path)) {
                projectMap.set(project.path, { project, components: [] });
            }
            projectMap.get(project.path)?.components.push({
                componentId: update.componentId,
                currentVersion,
                latestVersion: update.latestVersion,
                releaseInfo: update.releaseInfo,
            });
        }
    }

    for (const { project, update } of templateUpdates) {
        const existing = projectMap.get(project.path);
        if (existing) {
            existing.templateUpdate = update;
        } else {
            projectMap.set(project.path, { project, components: [], templateUpdate: update });
        }
    }

    // Sort: current project first, then alphabetically
    const sortedProjects = Array.from(projectMap.values()).sort((a, b) => {
        const aIsCurrent = a.project.path === currentProject?.path;
        const bIsCurrent = b.project.path === currentProject?.path;
        if (aIsCurrent && !bIsCurrent) return -1;
        if (!aIsCurrent && bIsCurrent) return 1;
        return a.project.name.localeCompare(b.project.name);
    });

    // Assemble items
    const items: UpdateItem[] = [...forkSyncItems];

    for (const { project, components, templateUpdate } of sortedProjects) {
        const isCurrent = project.path === currentProject?.path;
        const projectLabel = isCurrent ? `${project.name} (current)` : project.name;

        if (templateUpdate) {
            items.push({
                label: projectLabel,
                detail: `    EDS Template  ${formatBehindLabel(templateUpdate.commitsBehind)}`,
                description: `${templateUpdate.templateOwner}/${templateUpdate.templateRepo}`,
                picked: isCurrent,
                project,
                templateUpdate,
                isTemplateUpdate: true,
            } as TemplateUpdateItem);
        }

        for (const comp of components) {
            items.push({
                label: projectLabel,
                detail: `    ${comp.componentId}  ${comp.currentVersion} → ${comp.latestVersion}`,
                picked: isCurrent,
                project,
                componentId: comp.componentId,
                currentVersion: comp.currentVersion,
                latestVersion: comp.latestVersion,
                releaseInfo: comp.releaseInfo,
                isProjectUpdate: true,
            } as ProjectUpdateItem);
        }
    }

    items.push(...blockLibraryItems);
    items.push(...inspectorItems);

    // Build summary title
    // Forks are repo-level, not project-level, so excluded from project count
    const allProjectPaths = new Set([
        ...projectMap.keys(),
        ...blockLibraryItems.map(b => b.project.path),
        ...inspectorItems.map(i => i.project.path),
    ]);

    const totalComponents = Array.from(projectMap.values())
        .reduce((sum, p) => sum + p.components.length, 0);

    const parts: string[] = [];
    if (forkSyncItems.length > 0) parts.push(`${forkSyncItems.length} fork${forkSyncItems.length !== 1 ? 's' : ''}`);
    if (totalComponents > 0) parts.push(`${totalComponents} component${totalComponents !== 1 ? 's' : ''}`);
    if (templateUpdates.length > 0) parts.push(`${templateUpdates.length} template${templateUpdates.length !== 1 ? 's' : ''}`);
    const totalAddons = blockLibraryItems.length + inspectorItems.length;
    if (totalAddons > 0) parts.push(`${totalAddons} add-on${totalAddons !== 1 ? 's' : ''}`);

    const title = `Updates Available (${allProjectPaths.size} project${allProjectPaths.size !== 1 ? 's' : ''}, ${parts.join(', ')})`;

    return { items, title };
}
