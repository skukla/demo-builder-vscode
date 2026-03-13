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
