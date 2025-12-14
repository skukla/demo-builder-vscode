/**
 * QuickPick utilities for webview handlers
 *
 * When QuickPicks are triggered from webview message handlers, the standard
 * vscode.window.showQuickPick() can have keyboard issues (Enter not selecting).
 * This is because the webview's acknowledgment message processing can interfere
 * with focus management.
 *
 * These utilities use createQuickPick() with explicit event handling to ensure
 * proper keyboard behavior in all contexts.
 */

import * as vscode from 'vscode';

export interface WebviewQuickPickOptions {
    /** Placeholder text shown in the input box */
    placeholder?: string;
    /** Title shown at the top of the QuickPick */
    title?: string;
    /** Whether to keep the QuickPick open when focus moves elsewhere (default: true for webview handlers) */
    ignoreFocusOut?: boolean;
    /** Whether to allow selecting multiple items */
    canPickMany?: boolean;
    /** Whether to match on description text when filtering */
    matchOnDescription?: boolean;
    /** Whether to match on detail text when filtering */
    matchOnDetail?: boolean;
}

/**
 * Show a QuickPick that works reliably from webview handlers
 *
 * Use this instead of vscode.window.showQuickPick() when the QuickPick is
 * triggered from a webview message handler. This ensures proper keyboard
 * handling (Enter to select, Escape to cancel).
 *
 * @param items - QuickPick items to display
 * @param options - Configuration options
 * @returns The selected item, or undefined if cancelled
 *
 * @example
 * ```typescript
 * const selected = await showWebviewQuickPick(items, {
 *     title: 'Select a project',
 *     placeholder: 'Choose one...',
 * });
 * ```
 */
export async function showWebviewQuickPick<T extends vscode.QuickPickItem>(
    items: T[],
    options: WebviewQuickPickOptions = {},
): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve) => {
        const quickPick = vscode.window.createQuickPick<T>();

        quickPick.items = items;
        quickPick.placeholder = options.placeholder;
        quickPick.title = options.title;
        quickPick.ignoreFocusOut = options.ignoreFocusOut ?? true;
        quickPick.canSelectMany = options.canPickMany ?? false;
        quickPick.matchOnDescription = options.matchOnDescription ?? false;
        quickPick.matchOnDetail = options.matchOnDetail ?? false;

        quickPick.onDidAccept(() => {
            const selection = quickPick.selectedItems[0];
            quickPick.hide();
            resolve(selection);
        });

        quickPick.onDidHide(() => {
            quickPick.dispose();
            resolve(undefined);
        });

        quickPick.show();
    });
}

/**
 * Show a multi-select QuickPick that works reliably from webview handlers
 *
 * @param items - QuickPick items to display
 * @param options - Configuration options
 * @returns Array of selected items, or undefined if cancelled
 */
export async function showWebviewQuickPickMany<T extends vscode.QuickPickItem>(
    items: T[],
    options: WebviewQuickPickOptions = {},
): Promise<T[] | undefined> {
    return new Promise<T[] | undefined>((resolve) => {
        const quickPick = vscode.window.createQuickPick<T>();

        quickPick.items = items;
        quickPick.placeholder = options.placeholder;
        quickPick.title = options.title;
        quickPick.ignoreFocusOut = options.ignoreFocusOut ?? true;
        quickPick.canSelectMany = true;
        quickPick.matchOnDescription = options.matchOnDescription ?? false;
        quickPick.matchOnDetail = options.matchOnDetail ?? false;

        quickPick.onDidAccept(() => {
            const selection = [...quickPick.selectedItems];
            quickPick.hide();
            resolve(selection.length > 0 ? selection : undefined);
        });

        quickPick.onDidHide(() => {
            quickPick.dispose();
            resolve(undefined);
        });

        quickPick.show();
    });
}
