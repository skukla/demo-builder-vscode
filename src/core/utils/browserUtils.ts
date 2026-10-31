/**
 * Browser Utilities
 *
 * Helpers for opening URLs in the system browser from the extension host.
 */

import { execFile } from 'child_process';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { sleep } from './sleep';
import { TIMEOUTS } from './timeoutConfig';

const execFileAsync = promisify(execFile);

/**
 * Open a URL in incognito mode (Chrome on macOS)
 * Falls back to normal browser if incognito is not available
 *
 * Resolves once Chrome's window is likely up, not when `open` returns: it waits Chrome's usual
 * start (`TIMEOUTS.UI.BROWSER_START`), so every caller's busy state covers the whole wait.
 *
 * @returns true if opened in incognito, false if fell back to normal browser
 */
export async function openInIncognito(url: string): Promise<boolean> {
    if (process.platform === 'darwin') {
        try {
            // Arguments, never a shell string: a URL is data. Inside a quoted shell
            // string, `$(…)` in a stored URL would run as a command.
            await execFileAsync('open', ['-na', 'Google Chrome', '--args', '--incognito', url]);
            await sleep(TIMEOUTS.UI.BROWSER_START);
            return true;
        } catch {
            // Chrome not available, fall back
        }
    }

    // Fallback to normal browser
    await vscode.env.openExternal(vscode.Uri.parse(url));
    return false;
}

/**
 * Open a URL in a private browser window, with a notification covering the launch.
 *
 * For an open with no button to show it working: a menu item, which closes as it is picked
 * (owner, 2026-10-31). A button shows its own spinner and calls `openInIncognito`. Chrome takes
 * two or three seconds to start, and `openInIncognito` waits that out, so the notification lasts
 * until the window is likely up. The URL is expected to be validated already — the caller
 * refuses a bad one in its own shape before anything opens.
 *
 * @param url - a validated URL
 * @returns true if opened in incognito, false if fell back to normal browser
 */
export async function openPrivateBrowser(url: string): Promise<boolean> {
    let openedIncognito = false;

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Opening a private browser',
            cancellable: false,
        },
        async () => {
            openedIncognito = await openInIncognito(url);
        },
    );

    return openedIncognito;
}

/**
 * Open a URL in the default browser, with data URL support.
 *
 * Data URLs (data:text/html;...) cannot be opened directly by the OS —
 * this function writes them to a temp file first, then opens the file.
 *
 * @param url - A regular URL or a data URL
 * @param tempFileName - Filename for the temp file (data URLs only)
 */
export async function openUrl(url: string, tempFileName = 'demo-builder-page.html'): Promise<void> {
    if (url.startsWith('data:')) {
        const match = url.match(/^data:([^;]+);([^,]+),(.*)$/);
        if (!match) {
            throw new Error('Invalid data URL format');
        }

        const [, mimeType, encoding, data] = match;
        const content = encoding === 'charset=utf-8'
            ? decodeURIComponent(data)
            : Buffer.from(data, 'base64').toString('utf-8');

        const ext = mimeType.includes('html') ? '.html' : '.txt';
        const tempFile = path.join(os.tmpdir(), tempFileName.replace(/\.[^.]+$/, '') + ext);
        await fsPromises.writeFile(tempFile, content, 'utf-8');
        await vscode.env.openExternal(vscode.Uri.file(tempFile));
    } else {
        await vscode.env.openExternal(vscode.Uri.parse(url));
    }
}
