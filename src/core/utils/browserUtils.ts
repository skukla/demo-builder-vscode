/**
 * Browser Utilities
 *
 * Opens URLs in incognito/private browsing mode for clean demo sessions.
 */

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Open a URL in incognito mode (Chrome on macOS)
 * Falls back to normal browser if incognito is not available
 *
 * @returns true if opened in incognito, false if fell back to normal browser
 */
export async function openInIncognito(url: string): Promise<boolean> {
    if (process.platform === 'darwin') {
        try {
            await execAsync(`open -na "Google Chrome" --args --incognito "${url}"`);
            return true;
        } catch {
            // Chrome not available, fall back
        }
    }

    // Fallback to normal browser
    await vscode.env.openExternal(vscode.Uri.parse(url));
    return false;
}
