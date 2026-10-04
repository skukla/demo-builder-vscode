/**
 * Renaming an App Builder integration: a LOCAL metadata write — no Adobe guards,
 * so it works offline — through one validation chain shared by the drawer's
 * inline field and the extension's input box.
 *
 * Split from `appBuilderComponentHandlers.ts` (EDS-8, 2026-10-04), which still
 * re-exports the handler, so the dashboard handler map keeps working.
 *
 * @module features/dashboard/handlers/appBuilderComponentRename
 */

import * as vscode from 'vscode';
import { resolveComponentTarget } from './appBuilderComponentOperation';
import { postComponentsSnapshot, postRowStatus } from './appBuilderComponentPush';
import {
    getAppBuilderComponent,
    listAppBuilderComponents,
    setAppBuilderComponent,
} from '@/core/state/appBuilderComponentState';
import { getAppBuilderComponentEntry } from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { MessageHandler } from '@/types/handlers';


/**
 * validateInput for the rename input box: reject empty/whitespace-only names
 * and case-insensitive trimmed duplicates of the OTHER integration entries'
 * display names (`name ?? id`). The entry's own current name stays allowed
 * (a no-op rename).
 *
 * The wizard applies the same duplicate rule in `IntegrationsStep.commitRename`
 * — it used to live in a `RenameIntegrationModal`, which the shared card's
 * inline pencil replaced. It does NOT share the empty-name branch:
 * `InlineRenameField` cancels an empty value before any host commit runs, so
 * only THIS path — a VS Code input box, with no such guard — must reject it.
 */
function validateRenameInput(value: string, takenNames: string[]): string | undefined {
    const trimmed = value.trim();
    if (trimmed === '') {
        return 'Enter a name.';
    }
    const lowered = trimmed.toLowerCase();
    if (takenNames.some((taken) => taken.trim().toLowerCase() === lowered)) {
        return 'That name is already used by another integration.';
    }
    return undefined;
}

/** The OTHER integration entries' display names (`name ?? id`) — the rename collision domain. */
function takenIntegrationNames(project: Project, id: string): string[] {
    return listAppBuilderComponents(project)
        .filter((entry) => entry.kind === 'integration' && entry.id !== id)
        .map((entry) => entry.name ?? entry.id);
}

/**
 * Resolve the new display name for a rename. Two doors, ONE validation chain:
 *   - inline payload `name` (drawer rename) → validateRenameInput directly;
 *     a failure comes back as `error` for inline display in the webview.
 *   - no payload name → the extension's input box (validateInput enforces the
 *     same rules live); `cancelled` when dismissed — write nothing.
 */
async function resolveRenameName(
    payloadName: string | undefined,
    currentLabel: string,
    takenNames: string[],
): Promise<{ name: string } | { error: string } | { cancelled: true }> {
    if (payloadName !== undefined) {
        const error = validateRenameInput(payloadName, takenNames);
        return error ? { error } : { name: payloadName.trim() };
    }
    const raw = await vscode.window.showInputBox({
        prompt: 'New integration name',
        value: currentLabel,
        validateInput: (value) => validateRenameInput(value, takenNames),
    });
    if (raw === undefined) {
        return { cancelled: true };
    }
    return { name: raw.trim() };
}

/**
 * Handle 'renameAppBuilderComponent' — display-name rename for a deployed
 * integration (shell instancing Step 10). The id (map key, folder, ow.package)
 * is IMMUTABLE; only the keyed entry's `name` changes. Mesh entries keep their
 * fixed "API Mesh" identity and are rejected. A LOCAL metadata write: no Adobe
 * guards (rename works offline). The extension owns the input surface — UNLESS
 * the payload carries an inline `name` (the drawer's InlineRenameField), which
 * skips the input box and round-trips validation errors for inline display.
 * Cancel writes nothing.
 */
export const handleRenameAppBuilderComponent: MessageHandler<{
    id?: string;
    name?: string;
}> = async (context, payload) => {
    const target = await resolveComponentTarget(context, payload?.id);
    if (!target.ok) return target.error;
    const { id, project } = target;

    const entry = getAppBuilderComponent(project, id);
    if (!entry || entry.kind !== 'integration') {
        return {
            success: false,
            error: 'Only integrations can be renamed',
            code: ErrorCode.INVALID_OPERATION,
        };
    }

    // Pre-built CATALOG integrations are excluded: the runner resolves
    // catalog-first and rewrites `name: entry.name` on every redeploy, so a
    // rename would be silently reverted. Same exclusion the settings
    // serializer applies (deriveAppBuilderComponentSources).
    // A second copy of a pre-built integration (AB-23) is pre-built too.
    // EXCEPT one named from an input (the ERP integration, AB-16o): the rename sets
    // that input, so the redeploy carries the new name instead of reverting it.
    const catalogEntry = getAppBuilderComponentEntry(entry.catalogId ?? id);
    if (catalogEntry !== undefined && !catalogEntry.nameFromEnvVar) {
        return {
            success: false,
            error: 'Pre-built catalog integrations cannot be renamed',
            code: ErrorCode.INVALID_OPERATION,
        };
    }

    const takenNames = takenIntegrationNames(project, id);
    const resolved = await resolveRenameName(payload?.name, entry.name ?? id, takenNames);
    if ('cancelled' in resolved) {
        return { success: true }; // cancelled — nothing written
    }
    if ('error' in resolved) {
        return { success: false, error: resolved.error, code: ErrorCode.CONFIG_INVALID };
    }

    const { name } = resolved;
    const renamed = setAppBuilderComponent(project, id, { ...entry, name });
    setNameInput(renamed, id, catalogEntry?.nameFromEnvVar, name);
    await context.stateManager.saveProject(renamed);
    // Same per-row channel the deploy path pushes — the status is unchanged
    // (the entry's current one); the name rides along to refresh the row label.
    await postRowStatus(id, entry.status, undefined, name);
    await postComponentsSnapshot(context);
    const note = commerceRenameNote(catalogEntry, name);
    // Not awaited: an agent's rename must not wait on a notification nobody clicks.
    if (note) void vscode.window.showInformationMessage(note);
    // The TRIMMED name, which is not necessarily what the caller sent. Additive:
    // the drawer's InlineRenameField reads `success`/`error` and ignores this.
    // `rename_integration` does not — a bare success renders as "{}".
    return { success: true, renamed: { id, name }, ...(note ? { note } : {}) };
};

/**
 * A pre-built integration named from an input keeps its name in that input, keyed by
 * its own id (a second copy has its own), so its next deploy sends the new name.
 */
function setNameInput(project: Project, id: string, input: string | undefined, name: string): void {
    if (!input) return;
    project.componentConfigs = {
        ...(project.componentConfigs ?? {}),
        [id]: { ...(project.componentConfigs?.[id] ?? {}), [input]: name },
    };
}

/**
 * What a rename of an app Commerce installs does NOT do yet: Commerce's labels are fixed
 * when the app is deployed, so they change on its next update. Offered, never run: a
 * deploy is a cloud operation the SC confirms.
 */
function commerceRenameNote(
    catalogEntry: AppBuilderComponentCatalogEntry | undefined,
    name: string,
): string | undefined {
    if (!catalogEntry?.nameFromEnvVar || catalogEntry.lifecycle !== 'app-management') return undefined;
    return (
        `Commerce Admin shows "${name}" (its menu entry, page title and app name) after the ` +
        "integration's next update: Update or Redeploy on its card, or update_integration / " +
        'redeploy_integration.'
    );
}
