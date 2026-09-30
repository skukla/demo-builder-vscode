/**
 * The content-reader half of "Manage Site Access" (EDS-22): who may READ a
 * storefront's authored content on DA.live, as QuickPick rows and the flows
 * behind them.
 *
 * Split from `manageSiteAccess.ts` when the two halves crossed the file-size
 * limit together: the Configuration Service roster (who administers the site)
 * and DA.live's permissions sheet (who reads its content) are the same job on two
 * systems, and each changes for its own reasons. The command owns the picker;
 * this module owns the rows and the flows for one of its sections. Reading,
 * mutating and verifying live in `contentAccessManagerHeadless`, which the MCP
 * tools share.
 *
 * With no project open the flow still works from a typed org and site: the
 * person sharing a storefront need not have built it with Demo Builder.
 *
 * @module commands/manageContentReaders
 */

import * as vscode from 'vscode';
import { maskEmail } from '@/core/utils/maskEmail';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import {
    addContentReader,
    listContentReaders,
    looksLikeEmail,
    removeContentReader,
    type ContentAccessListing,
    type ContentAccessMutation,
    type DaSiteTarget,
} from '@/features/eds/services/daLive/contentAccessManagerHeadless';
import type { Logger } from '@/types/logger';

/** QuickPick rows carry their action so the handler does not re-parse labels. */
export interface AccessAction extends vscode.QuickPickItem {
    action: 'add' | 'remove' | 'add-reader' | 'remove-reader' | 'noop';
    email?: string;
}

/** The command's notification surface, so this module stays a set of functions. */
export interface AccessUi {
    withProgress<T>(title: string, task: () => Promise<T>): Promise<T>;
    showWarning(message: string): Promise<void>;
    showError(message: string): Promise<void>;
    /** A landed change: the full sentence to the person, the masked one to the log. */
    notifySuccess(message: string, loggable: string): Promise<void>;
}

/** The context and logger the headless manager needs. */
export interface AccessDeps {
    context: vscode.ExtensionContext;
    logger: Logger;
}

/** The content-reader rows: one add action, one remove per reader; writers shown, not removable here. */
export function buildReaderItems(readers: ContentAccessListing | undefined): AccessAction[] {
    if (!readers) return [];
    if (readers.status !== 'ok') {
        return [
            {
                label: 'Content readers could not be read',
                description: readers.error ?? readers.status,
                action: 'noop',
            },
        ];
    }
    const items: AccessAction[] = [
        {
            label: '$(add) Let someone read the authored content',
            description: 'DA.live',
            action: 'add-reader',
        },
    ];
    for (const reader of readers.readers ?? []) {
        if (reader.actions === 'read') {
            items.push({
                label: `$(trash) Stop ${reader.email} reading the content`,
                description: 'content reader',
                action: 'remove-reader',
                email: reader.email,
            });
        } else {
            items.push({
                label: reader.email,
                description: 'writes the content (not removable here)',
                action: 'noop',
            });
        }
    }
    return items;
}

/** No project open: the content readers of a site named by hand. */
export async function manageContentReadersByInput(ui: AccessUi, deps: AccessDeps): Promise<void> {
    const org = await vscode.window.showInputBox({
        title: 'Content readers — which DA.live organization?',
        prompt: 'Your DA.live organization — usually your GitHub username',
        placeHolder: 'my-github-name',
        validateInput: (value) => (value.trim() ? undefined : 'Enter the organization'),
    });
    if (!org) return;
    const site = await vscode.window.showInputBox({
        title: `Content readers — which site in ${org.trim()}?`,
        prompt: 'The DA.live site — usually the storefront repository name',
        placeHolder: 'my-storefront',
        validateInput: (value) => (value.trim() ? undefined : 'Enter the site'),
    });
    if (!site) return;
    const target: DaSiteTarget = { org: org.trim(), site: site.trim() };

    const readers = await ui.withProgress('Reading content access', () =>
        listContentReaders(target, deps.context, deps.logger),
    );
    if (readers.status !== 'ok') {
        await reportReaderStatus(ui, readers);
        return;
    }
    const choice = await vscode.window.showQuickPick(buildReaderItems(readers), {
        title: `Content readers — ${target.org}/${target.site}`,
        placeHolder: 'Let someone read the authored content, or stop them',
    });
    if (!choice || choice.action === 'noop') return;
    await handleReaderAction(target, choice, ui, deps);
}

/** Run the reader action a picker row carries. */
export async function handleReaderAction(
    target: DaSiteTarget,
    choice: AccessAction,
    ui: AccessUi,
    deps: AccessDeps,
): Promise<void> {
    if (choice.action === 'add-reader') {
        await handleAddReader(target, ui, deps);
        return;
    }
    if (choice.action === 'remove-reader' && choice.email) {
        await handleRemoveReader(target, choice.email, ui, deps);
    }
}

async function handleAddReader(
    target: DaSiteTarget,
    ui: AccessUi,
    deps: AccessDeps,
): Promise<void> {
    const email = await vscode.window.showInputBox({
        title: 'Let someone read the authored content',
        prompt: `The Adobe account email that may read ${target.org}/${target.site} on DA.live`,
        placeHolder: 'name@adobe.com',
        validateInput: (value) =>
            looksLikeEmail(value) ? undefined : 'Enter a valid email address',
    });
    if (!email) return;

    const result = await ui.withProgress(`Letting ${email} read the content`, () =>
        addContentReader(target, email, deps.context, deps.logger),
    );
    await reportReaderMutation(
        ui,
        result,
        `${email} can now read ${target.site}'s content on DA.live.`,
        `${maskEmail(email)} can now read ${target.site}'s content on DA.live.`,
    );
}

async function handleRemoveReader(
    target: DaSiteTarget,
    email: string,
    ui: AccessUi,
    deps: AccessDeps,
): Promise<void> {
    const confirmed = await vscode.window.showWarningMessage(
        `Stop ${email} reading ${target.site}'s content?`,
        { modal: true },
        'Stop',
    );
    if (confirmed !== 'Stop') return;

    const result = await ui.withProgress(`Removing ${email}`, () =>
        removeContentReader(target, email, deps.context, deps.logger),
    );
    await reportReaderMutation(
        ui,
        result,
        `${email} no longer reads ${target.site}'s content.`,
        `${maskEmail(email)} no longer reads ${target.site}'s content.`,
    );
}

/** A reader listing or mutation that did not answer ok, in words a person can act on. */
async function reportReaderStatus(ui: AccessUi, result: ContentAccessListing): Promise<void> {
    if (result.status === 'no_credential') {
        await ui.showWarning(
            'No DA.live credential is stored. Sign in to DA.live, then try again.',
        );
        return;
    }
    if (result.status === 'not_authorized') {
        await ui.showWarning(
            `DA.live refused: only the owner of the ${result.org} organization can change who reads its content.`,
        );
        return;
    }
    if (result.status === 'invalid') {
        await ui.showWarning(result.error ?? 'That change is not allowed.');
        return;
    }
    await ui.showError(`The change did not go through: ${result.error ?? 'unknown error'}`);
}

/** Report a content-reader mutation, "accepted" and "landed" kept apart. */
async function reportReaderMutation(
    ui: AccessUi,
    result: ContentAccessMutation,
    successMessage: string,
    loggableMessage: string,
): Promise<void> {
    if (result.status !== 'ok') {
        await reportReaderStatus(ui, result);
        return;
    }
    if (!result.verified) {
        await ui.showWarning(
            'DA.live accepted the change but it did not show up when re-read. ' +
                'Wait a moment and re-open this list before relying on it.',
        );
        return;
    }
    await ui.notifySuccess(successMessage, loggableMessage);
}

/** How long a landed change stays in the status bar. */
export const STATUS_BAR_SUCCESS = TIMEOUTS.STATUS_BAR_SUCCESS;
