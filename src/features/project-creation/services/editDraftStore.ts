/**
 * Edit Draft Store
 *
 * Thin {@link vscode.Memento} wrapper persisting a reversible per-project edit
 * draft under a path-namespaced key. The wizard saves in-progress edits here so
 * reopening the editor for the same project restores them.
 *
 * @module features/project-creation/services/editDraftStore
 */

import type * as vscode from 'vscode';
import type { EditDraft } from '@/types/webview';

/** Key prefix; the target project's absolute path is appended for namespacing. */
export const DRAFT_KEY_PREFIX = 'projectCreation.editDraft:';

const keyFor = (projectPath: string): string => `${DRAFT_KEY_PREFIX}${projectPath}`;

/**
 * Read the saved edit draft for a project, or undefined when none exists.
 */
export function getEditDraft(
    memento: vscode.Memento,
    projectPath: string,
): EditDraft | undefined {
    return memento.get<EditDraft>(keyFor(projectPath));
}

/**
 * Persist the edit draft for a project.
 */
export async function saveEditDraft(
    memento: vscode.Memento,
    projectPath: string,
    draft: EditDraft,
): Promise<void> {
    await memento.update(keyFor(projectPath), draft);
}

/**
 * Remove the saved edit draft for a project (reverts to no draft).
 */
export async function clearEditDraft(
    memento: vscode.Memento,
    projectPath: string,
): Promise<void> {
    await memento.update(keyFor(projectPath), undefined);
}
